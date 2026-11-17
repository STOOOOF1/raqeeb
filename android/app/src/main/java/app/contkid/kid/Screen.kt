package app.contkid.kid

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.PowerManager
import android.os.SystemClock
import org.json.JSONObject

/**
 * حالة الشاشة لعدّاد وقت الاستخدام في واجهة الطفل:
 * on = الشاشة مضاءة، off = مجموع مدة الإطفاء (ms)، boot = وقت تشغيل الجهاز (ms منذ 1970).
 */
object Screen {
    @Volatile private var registered = false

    private fun prefs(c: Context) = c.getSharedPreferences("screen", Context.MODE_PRIVATE)
    private fun interactive(c: Context) = (c.getSystemService(Context.POWER_SERVICE) as PowerManager).isInteractive

    fun init(ctx: Context) {
        val c = ctx.applicationContext
        if (!registered) {
            registered = true
            val f = IntentFilter().apply {
                addAction(Intent.ACTION_SCREEN_ON)
                addAction(Intent.ACTION_SCREEN_OFF)
            }
            c.registerReceiver(object : BroadcastReceiver() {
                override fun onReceive(context: Context, intent: Intent) {
                    mark(context, intent.action == Intent.ACTION_SCREEN_ON)
                }
            }, f)
        }
        sync(c)
    }

    private fun sync(c: Context) = mark(c, interactive(c))

    @Synchronized
    private fun mark(c: Context, on: Boolean) {
        val p = prefs(c)
        val now = System.currentTimeMillis()
        val offAt = p.getLong("offAt", 0)
        if (on && offAt > 0) {
            p.edit().putLong("offTotal", p.getLong("offTotal", 0) + maxOf(0, now - offAt)).putLong("offAt", 0).apply()
        } else if (!on && offAt == 0L) {
            p.edit().putLong("offAt", now).apply()
        }
    }

    fun state(ctx: Context): String {
        val c = ctx.applicationContext
        sync(c)
        val p = prefs(c)
        val now = System.currentTimeMillis()
        val offAt = p.getLong("offAt", 0)
        val off = p.getLong("offTotal", 0) + if (offAt > 0) maxOf(0, now - offAt) else 0
        return JSONObject()
            .put("on", offAt == 0L)
            .put("off", off)
            .put("boot", now - SystemClock.elapsedRealtime())
            .toString()
    }
}
