package app.contkid.kid

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.PersistableBundle

/**
 * يستدعيه معالج الإعداد أثناء التجهيز برمز QR (أندرويد 10 فما فوق، وإلزامي من أندرويد 12):
 * - GET_PROVISIONING_MODE: نختار «جهاز مُدار بالكامل» فيصبح التطبيق مالك الجهاز.
 * - ADMIN_POLICY_COMPLIANCE: نطبّق السياسة ونوافق.
 */
class ProvisioningActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        savePairCode(this, intent)
        when (intent?.action) {
            DevicePolicyManager.ACTION_GET_PROVISIONING_MODE -> setResult(RESULT_OK,
                Intent().putExtra(DevicePolicyManager.EXTRA_PROVISIONING_MODE,
                    DevicePolicyManager.PROVISIONING_MODE_FULLY_MANAGED_DEVICE))
            DevicePolicyManager.ACTION_ADMIN_POLICY_COMPLIANCE -> {
                runCatching { Policy.apply(this) }
                setResult(RESULT_OK)
            }
            else -> setResult(RESULT_CANCELED)
        }
        finish()
    }
}

/** رمز الربط المضمَّن في رمز QR (PROVISIONING_ADMIN_EXTRAS_BUNDLE → pair_code) يُحفظ لتربط به الواجهة تلقائيًا */
fun savePairCode(c: Context, intent: Intent?) {
    val extras: PersistableBundle? = intent?.let {
        if (Build.VERSION.SDK_INT >= 33) it.getParcelableExtra(DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE, PersistableBundle::class.java)
        else @Suppress("DEPRECATION") it.getParcelableExtra(DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE)
    }
    val code = extras?.getString("pair_code")?.trim().orEmpty()
    if (code.matches(Regex("\\d{6}"))) {
        c.getSharedPreferences("provision", Context.MODE_PRIVATE).edit().putString("pair_code", code).apply()
    }
}

fun pairCode(c: Context, clear: Boolean): String {
    val p = c.getSharedPreferences("provision", Context.MODE_PRIVATE)
    val code = p.getString("pair_code", "").orEmpty()
    if (clear) p.edit().remove("pair_code").apply()
    return code
}
