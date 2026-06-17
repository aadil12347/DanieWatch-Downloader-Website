# DanieWatch ProGuard Rules

# Keep the JavaScript interface bridge
-keepclassmembers class com.daniewatch.app.MainActivity$DanieWatchBridge {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep WebView classes
-keepclassmembers class * extends android.webkit.WebViewClient {
    public void *(android.webkit.WebView, java.lang.String);
    public void *(android.webkit.WebView, java.lang.String, android.graphics.Bitmap);
}

# Keep the VCloudExtractor callback interface
-keep class com.daniewatch.app.VCloudExtractor$ExtractCallback { *; }
