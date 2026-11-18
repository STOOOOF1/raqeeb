package app.contkid.kid

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
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
    private var customView: View? = null
    private var customCallback: WebChromeClient.CustomViewCallback? = null
    private var pendingAudio: PermissionRequest? = null
    private var appsJson: String? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        instance = this
        Screen.init(this)
        rootView = FrameLayout(this)
        web = WebView(this)
        rootView.addView(web, ViewGroup.LayoutParams(-1, -1))
        setContentView(rootView)
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

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onDestroy() {
        if (instance === this) instance = null
        web.destroy()
        super.onDestroy()
    }

    @Deprecated("زر الرجوع يُمرَّر إلى الواجهة")
    override fun onBackPressed() {
        if (customView != null) web.webChromeClient?.onHideCustomView()
        else web.evaluateJavascript("window.onNativeBack && window.onNativeBack()", null)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
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

        @JavascriptInterface
        fun setPolicy(json: String) {
            val a = this@MainActivity
            runCatching { Policy.save(a, json) }
            runOnUiThread {
                Policy.apply(a)
                if (Policy.kiosk(a) && !Policy.isOpen(a) && !a.hasWindowFocus()) Policy.bringToFront(a)
            }
        }

        @JavascriptInterface
        fun openWifi() = runOnUiThread {
            Policy.openWifiWindow(this@MainActivity)
            runCatching { startActivity(Intent("android.settings.WIFI_SETTINGS").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
        }

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
