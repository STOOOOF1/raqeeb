package app.contkid.kid

import android.app.ActivityManager
import android.app.AlarmManager
import android.app.PendingIntent
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.SharedPreferences
import android.telecom.TelecomManager
import org.json.JSONObject

/**
 * سياسة القفل التي ترسلها واجهة الطفل (setPolicy) وتطبيقها على النظام.
 * عند كون التطبيق «مالك الجهاز» يُحصر الجهاز في وضع Lock Task ولا يُسمح إلا بالتطبيقات المفتوحة الآن.
 */
object Policy {
    private const val PREFS = "policy"
    private val RESTRICTIONS = listOf("no_factory_reset", "no_safe_boot", "no_add_user", "no_config_date_time")

    private fun prefs(c: Context): SharedPreferences = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private fun dpm(c: Context) = c.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    private fun admin(c: Context) = ComponentName(c, AdminReceiver::class.java)

    fun isOwner(c: Context): Boolean = dpm(c).isDeviceOwnerApp(c.packageName)
    fun kiosk(c: Context): Boolean = prefs(c).getBoolean("kiosk", true)
    fun allowed(c: Context): Set<String> = prefs(c).getStringSet("allowed", emptySet()) ?: emptySet()

    fun isOpen(c: Context): Boolean {
        val p = prefs(c)
        val now = System.currentTimeMillis()
        val until = p.getLong("until", 0)
        val breakAt = p.getLong("breakAt", 0)
        return p.getBoolean("unlocked", false) && until > now && (breakAt == 0L || now < breakAt)
    }

    fun inLockTask(c: Context): Boolean =
        (c.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).lockTaskModeState != ActivityManager.LOCK_TASK_MODE_NONE

    fun save(c: Context, json: String) {
        val o = JSONObject(json)
        val arr = o.optJSONArray("allowed")
        val set = HashSet<String>()
        if (arr != null) for (i in 0 until arr.length()) set.add(arr.getString(i))
        prefs(c).edit()
            .putBoolean("unlocked", o.optBoolean("unlocked", false))
            .putBoolean("kiosk", o.optBoolean("kiosk", true))
            .putLong("until", o.optLong("until", 0))
            .putLong("breakAt", o.optLong("breakAt", 0))
            .putStringSet("allowed", set)
            .apply()
    }

    /** يسمح بإعدادات الواي فاي دقيقتين (من شاشة الربط) */
    fun openWifiWindow(c: Context) {
        prefs(c).edit().putLong("wifiUntil", System.currentTimeMillis() + 120_000).apply()
        apply(c)
    }

    private fun wifiPackage(c: Context): String? =
        Intent("android.settings.WIFI_SETTINGS").resolveActivity(c.packageManager)?.packageName

    fun apply(c: Context) {
        val now = System.currentTimeMillis()
        if (isOwner(c)) {
            val dpm = dpm(c)
            val admin = admin(c)
            if (!kiosk(c)) {
                runCatching { dpm.setLockTaskPackages(admin, arrayOf()) }
                runCatching { dpm.clearPackagePersistentPreferredActivities(admin, c.packageName) }
                for (r in RESTRICTIONS) runCatching { dpm.clearUserRestriction(admin, r) }
            } else {
                val pkgs = LinkedHashSet<String>()
                pkgs.add(c.packageName)
                pkgs.addAll(listOf("com.google.android.permissioncontroller", "com.android.permissioncontroller", "com.android.server.telecom"))
                (c.getSystemService(Context.TELECOM_SERVICE) as? TelecomManager)?.defaultDialerPackage?.let { pkgs.add(it) }
                if (isOpen(c)) pkgs.addAll(allowed(c))
                if (prefs(c).getLong("wifiUntil", 0) > now) wifiPackage(c)?.let { pkgs.add(it) }
                runCatching { dpm.setLockTaskPackages(admin, pkgs.toTypedArray()) }
                if (android.os.Build.VERSION.SDK_INT >= 28) runCatching {
                    dpm.setLockTaskFeatures(
                        admin,
                        DevicePolicyManager.LOCK_TASK_FEATURE_SYSTEM_INFO or
                            DevicePolicyManager.LOCK_TASK_FEATURE_HOME or
                            DevicePolicyManager.LOCK_TASK_FEATURE_GLOBAL_ACTIONS,
                    )
                }
                val home = IntentFilter(Intent.ACTION_MAIN).apply {
                    addCategory(Intent.CATEGORY_HOME)
                    addCategory(Intent.CATEGORY_DEFAULT)
                }
                runCatching { dpm.addPersistentPreferredActivity(admin, home, ComponentName(c, MainActivity::class.java)) }
                for (r in RESTRICTIONS) runCatching { dpm.addUserRestriction(admin, r) }
                runCatching {
                    dpm.setPermissionGrantState(admin, c.packageName, android.Manifest.permission.RECORD_AUDIO,
                        DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED)
                }
            }
        }
        schedule(c, now)
        MainActivity.instance?.syncLockTask()
    }

    /** يطبّق السياسة ويعيد واجهة الطفل للأمام إن انتهى الوقت المفتوح */
    fun enforce(c: Context) {
        apply(c)
        if (kiosk(c) && !isOpen(c)) bringToFront(c)
    }

    fun bringToFront(c: Context) {
        runCatching {
            c.startActivity(Intent(c, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT))
        }
    }

    /** منبّه عند أقرب موعد (نهاية الوقت، الفاصل، نهاية نافذة الواي فاي) لإعادة القفل ولو كانت الواجهة متوقفة */
    private fun schedule(c: Context, now: Long) {
        val p = prefs(c)
        val am = c.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val pi = PendingIntent.getBroadcast(c, 1, Intent(c, PolicyReceiver::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        am.cancel(pi)
        val times = mutableListOf(p.getLong("wifiUntil", 0))
        if (p.getBoolean("unlocked", false)) {
            times.add(p.getLong("until", 0))
            times.add(p.getLong("breakAt", 0))
        }
        val next = times.filter { it > now }.minOrNull() ?: return
        try {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pi)
        } catch (e: SecurityException) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pi)
        }
    }
}
