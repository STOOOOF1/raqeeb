package app.contkid.kid

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.util.Base64
import android.view.View
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.MimeTypeMap
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream

/**
 * واجهة الطفل: WebView يعرض kid/index.html من أصول التطبيق على نطاق https://appassets.androidplatform.net
 * (نطاق ثابت فتبقى الجلسة وlocalStorage)، مع جسر AndroidBridge الذي تستدعيه kid.js.
 */
class MainActivity : Activity() {
    companion object {
        private const val HOST = "appassets.androidplatform.net"
        private const val START = "https://$HOST/kid/index.html"
        @Volatile var instance: MainActivity? = null
    }

    private lateinit var rootView: FrameLayout
    private lateinit var web: WebView
    private lateinit var site: Site
    private var customView: View? = null
    private var customCallback: WebChromeClient.CustomViewCallback? = null
    private var pendingAudio: PermissionRequest? = null
    @Volatile private var appsJson: String? = null

    // تثبيت تطبيق أو حذفه أو تحديثه: نُسقط القائمة المحفوظة ونبلّغ الواجهة لترسل الجديدة
    private val pkgReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            appsJson = null
            if (::web.isInitialized) web.post { web.evaluateJavascript("window.onAppsChanged && window.onAppsChanged()", null) }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        instance = this
        Screen.init(this)
        rootView = FrameLayout(this)
        web = WebView(this)
        rootView.addView(web, ViewGroup.LayoutParams(-1, -1))
        setContentView(rootView)
        site = Site(this, rootView)
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            allowContentAccess = false
            setSupportMultipleWindows(false)
            textZoom = 100
        }
        web.overScrollMode = View.OVER_SCROLL_NEVER
        web.setBackgroundColor(Color.parseColor("#F4F1EA"))
        web.addJavascriptInterface(Bridge(), "AndroidBridge")
        web.webViewClient = Client()
        web.webChromeClient = Chrome()
        registerReceiver(pkgReceiver, IntentFilter().apply {
            addAction(Intent.ACTION_PACKAGE_ADDED)
            addAction(Intent.ACTION_PACKAGE_REMOVED)
            addAction(Intent.ACTION_PACKAGE_REPLACED)
            addDataScheme("package")
        })
        savePairCode(this, intent) // PROVISIONING_SUCCESSFUL قد يحمل الإضافات أيضًا
        if (savedInstanceState != null) web.restoreState(savedInstanceState) else web.loadUrl(START)
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED && !Policy.isOwner(this)) {
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 1)
        }
    }

    override fun onResume() {
        super.onResume()
        Policy.apply(this)
    }

    // خرج الطفل من التطبيق أو أُطفئت الشاشة: أغلق أي تسجيل مفتوح حتى لا يبقى الميكروفون شغالًا في الخلفية
    override fun onStop() {
        super.onStop()
        if (::web.isInitialized) web.evaluateJavascript("window.ckStopMic && window.ckStopMic()", null)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onDestroy() {
        if (instance === this) instance = null
        runCatching { unregisterReceiver(pkgReceiver) }
        site.close()
        web.destroy()
        super.onDestroy()
    }

    /** تنفيذ JavaScript في الواجهة من أي خيط */
    fun js(code: String) = web.post { web.evaluateJavascript(code, null) }

    @Deprecated("زر الرجوع يُمرَّر إلى الواجهة")
    override fun onBackPressed() {
        if (customView != null) web.webChromeClient?.onHideCustomView()
        else if (site.isOpen) site.back()
        else web.evaluateJavascript("window.onNativeBack && window.onNativeBack()", null)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != 1) return
        val req = pendingAudio ?: return
        pendingAudio = null
        if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) req.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
        else req.deny()
    }

    /** يدخل وضع Lock Task أو يخرج منه حسب السياسة */
    fun syncLockTask() {
        val want = Policy.isOwner(this) && Policy.kiosk(this)
        val inLock = Policy.inLockTask(this)
        runCatching {
            if (want && !inLock) startLockTask()
            else if (!want && inLock) stopLockTask()
        }
    }

    // ================= الجسر =================
    inner class Bridge {
        /** يُسقط القائمة المحفوظة فيعيد getApps القراءة من النظام */
        @JavascriptInterface
        fun refreshApps() { appsJson = null }

        /** رقم البناء (يطابق android-N في إصدارات GitHub) */
        @JavascriptInterface
        fun versionCode(): Int = BuildConfig.VERSION_CODE

        /** ينزّل آخر إصدار ويثبّته؛ الحالة تصل عبر window.onUpdateStatus */
        @JavascriptInterface
        fun installUpdate(url: String) =
            Updater.start(this@MainActivity, if (url.startsWith("https://github.com/STOOOOF1/raqeeb/")) url else Updater.LATEST_APK)

        @JavascriptInterface
        fun getApps(): String {
            appsJson?.let { return it }
            val pm = packageManager
            val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
            val out = JSONArray()
            val seen = HashSet<String>()
            for (ri in pm.queryIntentActivities(intent, 0)) {
                val pkg = ri.activityInfo.packageName
                if (pkg == packageName || !seen.add(pkg)) continue
                val o = JSONObject().put("package", pkg).put("label", ri.loadLabel(pm).toString())
                runCatching {
                    val bmp = Bitmap.createBitmap(72, 72, Bitmap.Config.ARGB_8888)
                    val d = ri.loadIcon(pm)
                    d.setBounds(0, 0, 72, 72)
                    d.draw(Canvas(bmp))
                    val bos = ByteArrayOutputStream()
                    @Suppress("DEPRECATION")
                    bmp.compress(Bitmap.CompressFormat.WEBP, 75, bos)
                    o.put("icon", "data:image/webp;base64," + Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP))
                }
                out.put(o)
            }
            return out.toString().also { appsJson = it }
        }

        @JavascriptInterface
        fun launchApp(pkg: String) = runOnUiThread {
            val a = this@MainActivity
            if (!Policy.kiosk(a) || (Policy.isOpen(a) && Policy.allowed(a).contains(pkg))) {
                val i = packageManager.getLaunchIntentForPackage(pkg)
                if (i != null) runCatching { startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                else Toast.makeText(a, "تعذر فتح التطبيق", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(a, "التطبيق غير متاح الآن", Toast.LENGTH_SHORT).show()
            }
        }

        /** يفتح موقعًا أضافه الوالدان في متصفح مصغّر محصور بذلك الموقع (whole=false: الصفحة وما تحتها فقط) */
        @JavascriptInterface
        fun openSite(url: String, title: String, whole: Boolean) = runOnUiThread {
            val a = this@MainActivity
            if (Policy.kiosk(a) && !Policy.isOpen(a)) Toast.makeText(a, "الموقع غير متاح الآن", Toast.LENGTH_SHORT).show()
            else site.open(url, title, whole)
        }

        @JavascriptInterface
        fun closeSite() = runOnUiThread { site.close() }

        @JavascriptInterface
        fun setPolicy(json: String) {
            val a = this@MainActivity
            runCatching { Policy.save(a, json) }
            runOnUiThread {
                Policy.apply(a)
                if (!Policy.isOpen(a)) site.close() // انتهى الوقت أو حلّ الفاصل
                if (Policy.kiosk(a) && !Policy.isOpen(a) && !a.hasWindowFocus()) Policy.bringToFront(a)
            }
        }

        /** إعدادات الواي فاي في النظام: فقط حين لا يكون التطبيق مالك الجهاز (فلا قفل أصلًا).
         *  مع القفل لا تُفتح لأنها في بعض الأجهزة (شاومي) تفتح تطبيق الإعدادات كله؛ تُستعمل wifi* بدلها */
        @JavascriptInterface
        fun openWifi() = runOnUiThread {
            if (Policy.isOwner(this@MainActivity)) return@runOnUiThread
            runCatching { startActivity(Intent("android.settings.WIFI_SETTINGS").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
        }

        @JavascriptInterface
        fun wifiState(): String = Wifi.state(this@MainActivity)

        /** يجهّز إذن الموقع والواي فاي ثم يعيد الشبكات القريبة */
        @JavascriptInterface
        fun wifiNetworks(rescan: Boolean): String {
            val a = this@MainActivity
            if (rescan) {
                Wifi.prepare(a)
                if (!Wifi.hasLocationPermission(a)) runOnUiThread {
                    requestPermissions(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION), 2)
                }
            }
            return Wifi.networks(a, rescan)
        }

        @JavascriptInterface
        fun wifiConnect(ssid: String, pass: String, sec: String, hidden: Boolean): String =
            runCatching { Wifi.connect(this@MainActivity, ssid, pass, sec, hidden) }.getOrElse { "تعذّر الاتصال: " + (it.message ?: "") }

        @JavascriptInterface
        fun toast(text: String) = runOnUiThread {
            Toast.makeText(applicationContext, text, Toast.LENGTH_LONG).show()
        }

        @JavascriptInterface
        fun info(): String = JSONObject()
            .put("native", true)
            .put("owner", Policy.isOwner(this@MainActivity))
            .put("model", Build.MANUFACTURER + " " + Build.MODEL)
            .put("android", Build.VERSION.RELEASE)
            .put("version", BuildConfig.VERSION_NAME)
            .toString()

        @JavascriptInterface
        fun screen(): String = Screen.state(this@MainActivity)

        @JavascriptInterface
        fun pairCode(clear: Boolean): String = app.contkid.kid.pairCode(this@MainActivity, clear)
    }

    // ================= تحميل الصفحات من الأصول =================
    private inner class Client : WebViewClient() {
        override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
            val url = request.url
            if (url.host != HOST) return null
            val path = (url.path ?: "").trimStart('/')
            if (path.contains("..")) return notFound()
            return try {
                val ext = path.substringAfterLast('.', "")
                val mime = when (ext) {
                    "js" -> "text/javascript"
                    "css" -> "text/css"
                    "svg" -> "image/svg+xml"
                    "html" -> "text/html"
                    "json" -> "application/json"
                    else -> MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: "application/octet-stream"
                }
                WebResourceResponse(mime, "utf-8", assets.open(path))
            } catch (e: Exception) {
                notFound()
            }
        }

        private fun notFound() = WebResourceResponse("text/plain", "utf-8", 404, "Not Found", emptyMap(), null)

        // لا يُسمح بالتنقل خارج صفحات التطبيق
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
            request.isForMainFrame && request.url.host != HOST
    }

    private inner class Chrome : WebChromeClient() {
        override fun onPermissionRequest(request: PermissionRequest) = runOnUiThread {
            if (request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE) && request.origin.host == HOST) {
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                    pendingAudio = request
                    requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 1)
                } else {
                    request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                }
            } else {
                request.deny()
            }
        }

        // ملء الشاشة لمقاطع يوتيوب
        override fun onShowCustomView(view: View, callback: CustomViewCallback) {
            if (customView != null) return callback.onCustomViewHidden()
            customView = view
            customCallback = callback
            view.setBackgroundColor(Color.BLACK)
            rootView.addView(view, ViewGroup.LayoutParams(-1, -1))
            web.visibility = View.GONE
        }

        override fun onHideCustomView() {
            customView?.let { rootView.removeView(it) }
            customView = null
            web.visibility = View.VISIBLE
            customCallback?.onCustomViewHidden()
            customCallback = null
        }
    }
}
