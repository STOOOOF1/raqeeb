package app.contkid.kid

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * تحديث التطبيق من داخله: ينزّل raqeeb.apk من آخر إصدار في GitHub ويثبّته.
 * مالك الجهاز يثبّت بصمت؛ غير ذلك يظهر للمستخدم طلب التثبيت المعتاد من النظام.
 * النظام يرفض أي ملف لا يحمل نفس شهادة التوقيع.
 */
object Updater {
    const val LATEST_APK = "https://github.com/STOOOOF1/raqeeb/releases/latest/download/raqeeb.apk"
    private const val ACTION = "app.contkid.kid.UPDATE_STATUS"
    @Volatile private var busy = false

    /** يرسل الحالة إلى الواجهة: window.onUpdateStatus({state, progress?, error?}) */
    fun report(state: String, extra: JSONObject.() -> Unit = {}) {
        val o = JSONObject().put("state", state).apply(extra)
        MainActivity.instance?.js("window.onUpdateStatus && window.onUpdateStatus($o)")
    }

    fun start(c: Context, url: String) {
        if (busy) return
        busy = true
        val app = c.applicationContext
        Thread {
            try {
                report("downloading") { put("progress", 0) }
                val session = app.packageManager.packageInstaller.let { pi ->
                    val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
                    params.setAppPackageName(app.packageName)
                    if (Build.VERSION.SDK_INT >= 31) params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
                    pi.openSession(pi.createSession(params))
                }
                session.use { s ->
                    val conn = (URL(url).openConnection() as HttpURLConnection).apply {
                        instanceFollowRedirects = true
                        connectTimeout = 20_000
                        readTimeout = 30_000
                    }
                    if (conn.responseCode != 200) throw Exception("HTTP " + conn.responseCode)
                    val total = conn.contentLengthLong
                    conn.inputStream.use { input ->
                        s.openWrite("raqeeb.apk", 0, total).use { out ->
                            val buf = ByteArray(64 * 1024)
                            var done = 0L
                            var last = -1
                            while (true) {
                                val n = input.read(buf)
                                if (n < 0) break
                                out.write(buf, 0, n)
                                done += n
                                val pct = if (total > 0) (done * 100 / total).toInt() else 0
                                if (pct != last) { last = pct; report("downloading") { put("progress", pct) } }
                            }
                            s.fsync(out)
                        }
                    }
                    report("installing")
                    val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
                    val pi = PendingIntent.getBroadcast(app, 7,
                        Intent(app, UpdateReceiver::class.java).setAction(ACTION), flags)
                    s.commit(pi.intentSender)
                }
            } catch (e: Exception) {
                busy = false
                report("error") { put("error", e.message ?: e.javaClass.simpleName) }
            }
        }.start()
    }

    fun onStatus(c: Context, intent: Intent) {
        when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                // ليس مالكًا للجهاز: يطلب النظام موافقة المستخدم
                @Suppress("DEPRECATION")
                val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
                if (confirm != null) runCatching { c.startActivity(confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                report("confirm")
            }
            PackageInstaller.STATUS_SUCCESS -> { busy = false; report("done") }
            else -> {
                busy = false
                report("error") { put("error", intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: "فشل التثبيت") }
            }
        }
    }
}

class UpdateReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) = Updater.onStatus(context, intent)
}
