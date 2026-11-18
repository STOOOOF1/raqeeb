package app.contkid.kid

import android.Manifest
import android.app.admin.DevicePolicyManager
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiConfiguration
import android.net.wifi.WifiManager
import android.os.Build
import android.provider.Settings
import org.json.JSONArray
import org.json.JSONObject

/**
 * الاتصال بالواي فاي من داخل التطبيق دون فتح إعدادات النظام
 * (في شاومي وغيرها صفحة الواي فاي جزء من تطبيق الإعدادات كله، فيصل الطفل منها لبقية الإعدادات).
 * إضافة الشبكات وتشغيل الواي فاي محصوران في أندرويد 10 فما فوق بمالك الجهاز، وهو حال تطبيقنا.
 */
@Suppress("DEPRECATION")
object Wifi {
    private val LOCATION = arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)

    private fun wm(c: Context) = c.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager

    fun hasLocationPermission(c: Context) =
        c.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

    private fun locationOn(c: Context): Boolean =
        if (Build.VERSION.SDK_INT >= 28) (c.getSystemService(Context.LOCATION_SERVICE) as LocationManager).isLocationEnabled
        else Settings.Secure.getInt(c.contentResolver, Settings.Secure.LOCATION_MODE, 0) != 0

    /** رؤية الشبكات تحتاج إذن الموقع وتشغيل خدمة الموقع: يمنحهما مالك الجهاز لنفسه */
    fun prepare(c: Context) {
        if (!Policy.isOwner(c)) return
        val dpm = Policy.dpm(c)
        val admin = Policy.admin(c)
        for (p in LOCATION) runCatching {
            dpm.setPermissionGrantState(admin, c.packageName, p, DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED)
        }
        if (Build.VERSION.SDK_INT >= 30 && !locationOn(c)) runCatching { dpm.setLocationEnabled(admin, true) }
        val w = wm(c)
        if (!w.isWifiEnabled) runCatching { w.setWifiEnabled(true) }
    }

    fun state(c: Context): String {
        val w = wm(c)
        val cm = c.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val caps = cm.getNetworkCapabilities(cm.activeNetwork)
        val onWifi = caps?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
        val ssid = if (onWifi) w.connectionInfo?.ssid?.removeSurrounding("\"")?.takeIf { it != WifiManager.UNKNOWN_SSID } else null
        return JSONObject()
            .put("owner", Policy.isOwner(c))
            .put("enabled", w.isWifiEnabled)
            .put("wifi", onWifi)
            .put("online", caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) == true)
            .put("ssid", ssid ?: "")
            .put("location", locationOn(c))
            .put("permission", hasLocationPermission(c))
            .toString()
    }

    private fun security(caps: String): String = when {
        caps.contains("EAP") -> "eap"
        caps.contains("PSK") -> "psk" // يشمل الشبكات المختلطة WPA2/WPA3
        caps.contains("SAE") -> "sae"
        caps.contains("WEP") -> "wep"
        else -> "open"
    }

    /** الشبكات القريبة (الأقوى أولًا)؛ rescan يطلب بحثًا جديدًا وتصل نتائجه بعد ثوانٍ */
    fun networks(c: Context, rescan: Boolean): String {
        val w = wm(c)
        if (rescan) runCatching { w.startScan() }
        val best = HashMap<String, android.net.wifi.ScanResult>()
        runCatching {
            for (r in w.scanResults) {
                val ssid = r.SSID ?: continue
                if (ssid.isBlank()) continue
                val old = best[ssid]
                if (old == null || r.level > old.level) best[ssid] = r
            }
        }
        val out = JSONArray()
        for (r in best.values.sortedByDescending { it.level }) {
            out.put(JSONObject()
                .put("ssid", r.SSID)
                .put("level", WifiManager.calculateSignalLevel(r.level, 5))
                .put("sec", security(r.capabilities ?: "")))
        }
        return out.toString()
    }

    /** يحفظ الشبكة ويتصل بها؛ يعيد نصًّا فارغًا عند البدء بنجاح أو رسالة الخطأ. نتيجة الاتصال تُعرف من state() */
    fun connect(c: Context, ssid: String, pass: String, sec: String, hidden: Boolean): String {
        if (!Policy.isOwner(c)) return "الاتصال من التطبيق يحتاج أن يكون التطبيق مالك الجهاز"
        if (ssid.isBlank()) return "اكتب اسم الشبكة"
        if (sec == "eap" || sec == "wep") return "هذه الشبكة تحتاج إعدادًا خاصًا، اطلب من والديك"
        if (sec != "open" && pass.length < 8) return "كلمة المرور 8 أحرف على الأقل"
        val w = wm(c)
        if (!w.isWifiEnabled) runCatching { w.setWifiEnabled(true) }
        val quoted = "\"" + ssid + "\""
        val cfg = WifiConfiguration().apply {
            SSID = quoted
            hiddenSSID = hidden
            when (sec) {
                "open" -> allowedKeyManagement.set(WifiConfiguration.KeyMgmt.NONE)
                else -> {
                    if (sec == "sae" && Build.VERSION.SDK_INT >= 29) {
                        allowedKeyManagement.set(WifiConfiguration.KeyMgmt.SAE) // النظام يفرض PMF مع SAE تلقائيًا
                    }
                    // مفتاح من 64 رمزًا ست عشريًا يُمرَّر كما هو، وغيره كلمة مرور بين علامتي تنصيص
                    preSharedKey = if (pass.length == 64 && pass.all { it.isDigit() || it.lowercaseChar() in 'a'..'f' }) pass else "\"" + pass + "\""
                }
            }
        }
        // نحذف ما حُفظ سابقًا بالاسم نفسه حتى لا تبقى كلمة مرور قديمة خاطئة
        runCatching { w.configuredNetworks?.filter { it.SSID == quoted }?.forEach { w.removeNetwork(it.networkId) } }
        val id = w.addNetwork(cfg)
        if (id == -1) return "تعذّر حفظ الشبكة"
        w.disconnect()
        if (!w.enableNetwork(id, true)) return "تعذّر الاتصال بالشبكة"
        w.reconnect()
        return ""
    }
}
