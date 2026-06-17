package com.daniewatch.app;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

/**
 * MainActivity — Full-screen WebView wrapper for DanieWatch.
 * 
 * Loads the production website in a WebView and injects a JavaScript bridge
 * (window.DanieWatchBridge) that the website can use to extract VCloud
 * download links via a hidden background WebView.
 */
public class MainActivity extends Activity {

    private static final String WEBSITE_URL = "https://daniewatch-downloader.vercel.app/";
    
    private WebView mainWebView;
    private VCloudExtractor vcloudExtractor;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Full-screen immersive, dark status bar
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        Window window = getWindow();
        window.setStatusBarColor(Color.parseColor("#050507"));
        window.setNavigationBarColor(Color.parseColor("#050507"));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.getAttributes().layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }

        // Create layout
        FrameLayout rootLayout = new FrameLayout(this);
        rootLayout.setBackgroundColor(Color.parseColor("#050507"));

        // Create main WebView
        mainWebView = new WebView(this);
        configureWebView(mainWebView);
        
        // Enable cookies
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(mainWebView, true);

        // Initialize VCloud extractor
        vcloudExtractor = new VCloudExtractor();

        // Add JavaScript interface bridge
        mainWebView.addJavascriptInterface(new DanieWatchBridge(), "DanieWatchBridge");

        // WebView client
        mainWebView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                
                // Keep navigation within the app for our domain
                if (url.contains("daniewatch-downloader.vercel.app")) {
                    return false; // Let WebView handle it
                }
                
                // External links open in system browser
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    startActivity(intent);
                } catch (Exception e) {
                    // Ignore
                }
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                // Inject a marker so the website knows it's in the native app
                view.evaluateJavascript(
                    "if(!window.DanieWatchBridge){window.DanieWatchBridge={_native:true};}",
                    null
                );
            }
        });

        // WebChromeClient for progress and console
        mainWebView.setWebChromeClient(new WebChromeClient());

        // Download listener — handles direct file downloads
        mainWebView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition,
                                        String mimeType, long contentLength) {
                try {
                    DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                    
                    String fileName = URLUtil.guessFileName(url, contentDisposition, mimeType);
                    request.setTitle(fileName);
                    request.setDescription("Downloading via DanieWatch...");
                    request.setNotificationVisibility(
                        DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                    request.setDestinationInExternalPublicDir(
                        Environment.DIRECTORY_DOWNLOADS, fileName);
                    request.setMimeType(mimeType);
                    
                    // Add cookies
                    String cookies = CookieManager.getInstance().getCookie(url);
                    if (cookies != null) {
                        request.addRequestHeader("Cookie", cookies);
                    }
                    request.addRequestHeader("User-Agent", userAgent);

                    DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                    dm.enqueue(request);

                    Toast.makeText(MainActivity.this,
                        "Download started: " + fileName, Toast.LENGTH_SHORT).show();
                } catch (Exception e) {
                    // Fallback: open in browser
                    try {
                        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                        startActivity(intent);
                    } catch (Exception ex) {
                        Toast.makeText(MainActivity.this,
                            "Download failed", Toast.LENGTH_SHORT).show();
                    }
                }
            }
        });

        rootLayout.addView(mainWebView, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT));

        setContentView(rootLayout);
        mainWebView.loadUrl(WEBSITE_URL);
    }

    /**
     * Configure WebView settings for full web app support.
     */
    private void configureWebView(WebView webView) {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(false);
        
        // User agent — append our app identifier
        String defaultUA = settings.getUserAgentString();
        settings.setUserAgentString(defaultUA + " DanieWatchApp/1.0");
    }

    /**
     * JavaScript interface bridge exposed as window.DanieWatchBridge.
     * Called from the website's JS to extract VCloud download links.
     */
    public class DanieWatchBridge {

        @JavascriptInterface
        public String extractVCloud(String vcloudUrl) {
            // This runs on a WebView JS thread. We need to do the extraction
            // on the main thread (WebView requirement) and block until done.
            final String[] result = new String[1];
            final Object lock = new Object();

            new Handler(Looper.getMainLooper()).post(() -> {
                vcloudExtractor.extract(MainActivity.this, vcloudUrl,
                    new VCloudExtractor.ExtractCallback() {
                        @Override
                        public void onResult(String jsonResult) {
                            synchronized (lock) {
                                result[0] = jsonResult;
                                lock.notify();
                            }
                        }

                        @Override
                        public void onError(String error) {
                            synchronized (lock) {
                                result[0] = "{\"error\":\"" + error.replace("\"", "'") + "\"}";
                                lock.notify();
                            }
                        }
                    });
            });

            synchronized (lock) {
                try {
                    lock.wait(30000); // 30 second timeout
                } catch (InterruptedException e) {
                    return "{\"error\":\"Extraction timed out.\"}";
                }
            }

            return result[0] != null ? result[0] : "{\"error\":\"No result.\"}";
        }

        @JavascriptInterface
        public boolean isNativeApp() {
            return true;
        }

        @JavascriptInterface
        public String getAppVersion() {
            return "1.0.0";
        }
    }

    @Override
    public void onBackPressed() {
        if (mainWebView != null && mainWebView.canGoBack()) {
            mainWebView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (mainWebView != null) {
            mainWebView.destroy();
        }
        if (vcloudExtractor != null) {
            vcloudExtractor.cleanup();
        }
        super.onDestroy();
    }
}
