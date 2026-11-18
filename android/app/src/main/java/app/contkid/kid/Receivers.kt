package app.contkid.kid

import android.app.admin.DeviceAdminReceiver
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** مستقبل مسؤول الجهاز: app.contkid.kid/.AdminReceiver */
class AdminReceiver : DeviceAdminReceiver() {
    // ينتهي هنا التجهيز برمز QR (أو بأمر adb): نطبّق القفل ونفتح واجهة الطفل
    override fun onProfileProvisioningComplete(context: Context, intent: Intent) {
        savePairCode(context, intent)
        Policy.apply(context)
        Policy.bringToFront(context)
    }
}

/** منبّه السياسة: يعيد تطبيق القفل عند انتهاء الوقت أو حلول الفاصل */
class PolicyReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        Screen.init(context)
        Policy.enforce(context)
    }
}

/** بعد تشغيل الجهاز أو تحديث التطبيق */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        Screen.init(context)
        Policy.enforce(context)
        // بعد التحديث من داخل التطبيق نعيد فتح الواجهة
        if (intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) Policy.bringToFront(context)
    }
}
