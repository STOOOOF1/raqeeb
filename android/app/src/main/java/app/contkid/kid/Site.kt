package app.contkid.kid

import android.annotation.SuppressLint
import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast

/**
 * متصفح مصغّر داخل رقيب لموقع أضافه الوالدان: لا شريط عناوين، ولا تنقل خارج الموقع المسموح،
 * ولا تنزيلات ولا نوافذ جديدة. يُغلق تلقائيًا حين يُقفل الجهاز (انتهاء الوقت أو الفاصل).
 *
 * النطاق: whole=true ← كل صفحات النطاق نفسه (ونطاقاته الفرعية)، وإلا فالصفحة المحددة وما تحت مسارها فقط.
 */
class Site(private val a: Activity, private val root: FrameLayout) {
    private var box: View? = null
    private var web: WebView? = null
    private var host = ""
    private var prefix = ""
    private var whole = true

    val isOpen get() = box != null

    @SuppressLint("SetJavaScriptEnabled")
    fun open(url: String, title: String, wholeSite: Boolean) {
        close()
        val u = Uri.parse(url)
        if (u.scheme != "https" || u.host.isNullOrBlank()) {
            Toast.makeText(a, "رابط غير صالح", Toast.LENGTH_SHORT).show(); return
        }
        host = u.host!!.lowercase().removePrefix("www.")
        prefix = url.substringBefore('#').substringBefore('?')
        whole = wholeSite

        val dp = a.resources.displayMetrics.density
        fun btn(text: String, onClick: () -> Unit) = TextView(a).apply {
            this.text = text; textSize = 20f; setTextColor(Color.WHITE)
            gravity = Gravity.CENTER; setPadding((14 * dp).toInt(), 0, (14 * dp).toInt(), 0)
            setOnClickListener { onClick() }
        }
        val label = TextView(a).apply {
            text = title.ifBlank { host }; textSize = 16f; setTextColor(Color.WHITE)
            typeface = Typeface.DEFAULT_BOLD; isSingleLine = true; gravity = Gravity.CENTER_VERTICAL
            textDirection = View.TEXT_DIRECTION_RTL
        }
        val w = WebView(a)
        val bar = LinearLayout(a).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(Color.parseColor("#0F766E"))
            layoutDirection = View.LAYOUT_DIRECTION_RTL
            addView(btn("✕") { close() }, LinearLayout.LayoutParams(-2, -1))
            addView(label, LinearLayout.LayoutParams(0, -1, 1f))
            addView(btn("⟳") { w.reload() }, LinearLayout.LayoutParams(-2, -1))
            addView(btn("→") { back() }, LinearLayout.LayoutParams(-2, -1))
        }
        val progress = ProgressBar(a, null, android.R.attr.progressBarStyleHorizontal).apply { max = 100 }
        w.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = true
            allowFileAccess = false
            allowContentAccess = false
            setSupportMultipleWindows(false) // روابط target=_blank تُفتح هنا ثم تمر على فحص النطاق
            javaScriptCanOpenWindowsAutomatically = false
            builtInZoomControls = true; displayZoomControls = false
            loadWithOverviewMode = true; useWideViewPort = true
        }
        CookieManager.getInstance().setAcceptThirdPartyCookies(w, false)
        w.setDownloadListener { _, _, _, _, _ -> Toast.makeText(a, "التنزيل غير مسموح", Toast.LENGTH_SHORT).show() }
        w.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
                if (!req.isForMainFrame) return false
                if (allowed(req.url)) return false
                Toast.makeText(a, "هذه الصفحة خارج الموقع المسموح", Toast.LENGTH_SHORT).show()
                return true
            }
        }
        w.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView, p: Int) {
                progress.progress = p; progress.visibility = if (p >= 100) View.GONE else View.VISIBLE
            }
        }
        val col = LinearLayout(a).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.WHITE)
            isClickable = true // لا تمر اللمسات إلى الواجهة تحته
            addView(bar, LinearLayout.LayoutParams(-1, (52 * dp).toInt()))
            addView(progress, LinearLayout.LayoutParams(-1, (3 * dp).toInt()))
            addView(w, LinearLayout.LayoutParams(-1, 0, 1f))
        }
        root.addView(col, ViewGroup.LayoutParams(-1, -1))
        box = col; web = w
        w.loadUrl(url)
    }

    private fun allowed(u: Uri): Boolean {
        if (u.scheme != "https") return false
        val h = (u.host ?: return false).lowercase().removePrefix("www.")
        if (whole) return h == host || h.endsWith(".$host")
        val s = u.toString().substringBefore('#').substringBefore('?')
        return h == host && (s == prefix || s.startsWith(prefix.trimEnd('/') + "/"))
    }

    /** زر الرجوع: صفحة سابقة داخل الموقع، وإلا الإغلاق */
    fun back() {
        val w = web ?: return
        if (w.canGoBack()) w.goBack() else close()
    }

    fun close() {
        val b = box ?: return
        box = null
        root.removeView(b)
        web?.apply { stopLoading(); loadUrl("about:blank"); destroy() }
        web = null
    }
}
