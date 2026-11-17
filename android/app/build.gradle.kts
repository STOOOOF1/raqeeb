plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// صفحات الويب (واجهة الطفل والمشترك) تُنسخ من جذر المستودع إلى أصول التطبيق عند كل بناء
val webRoot = rootProject.projectDir.parentFile
val webAssets = layout.buildDirectory.dir("generated/web")
val syncWeb by tasks.registering(Sync::class) {
    from(webRoot) {
        include("kid/**", "shared/**", "parent/icon-192.png", "parent/icon.svg")
    }
    into(webAssets)
}

// التوقيع: يأتي من البيئة في GitHub Actions (انظر .github/workflows/android.yml)
val ksFile = System.getenv("RAQEEB_KEYSTORE")?.let { file(it) }
val ksPass = System.getenv("RAQEEB_KEYSTORE_PASS")

android {
    namespace = "app.contkid.kid"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.contkid.kid"
        minSdk = 26
        targetSdk = 34
        versionCode = (System.getenv("RAQEEB_VERSION_CODE") ?: "2").toInt()
        versionName = "1.2." + (System.getenv("RAQEEB_VERSION_CODE") ?: "0")
    }

    signingConfigs {
        if (ksFile != null && ksFile.exists()) {
            create("release") {
                storeFile = ksFile
                storePassword = ksPass
                keyAlias = "raqeeb"
                keyPassword = ksPass
                storeType = "pkcs12"
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release")
        }
    }

    buildFeatures { buildConfig = true }

    lint {
        abortOnError = false
        checkReleaseBuilds = false
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    sourceSets["main"].assets.srcDir(syncWeb)
}

tasks.named("preBuild") { dependsOn(syncWeb) }
