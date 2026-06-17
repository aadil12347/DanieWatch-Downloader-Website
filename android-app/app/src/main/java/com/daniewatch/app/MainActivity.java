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
                String urlLower = url.toLowerCase();

                // 1. Intercept direct video download streams to bypass error page loads (404/403)
                if (urlLower.contains("/api/stream") || 
                    urlLower.contains("fastdl") || urlLower.contains("fsl.") || 
                    urlLower.contains("hubcloud") || urlLower.contains("gpdl") || 
                    urlLower.contains("r2.cloudflarestorage") || urlLower.contains("r2.dev")) {
                    
                    String downloadUrl = url;
                    if (urlLower.contains("/api/stream")) {
                        Uri uri = Uri.parse(url);
                        String rawUrl = uri.getQueryParameter("url");
                        if (rawUrl != null && !rawUrl.isEmpty()) {
                            downloadUrl = rawUrl;
                        }
                    }
                    
                    new DanieWatchBridge().startDownload(downloadUrl, "DanieWatch Video");
                    return true; // Cancel navigation
                }
                
                // 2. Keep navigation within the app for current domain dynamically
                try {
                    String currentUrl = view.getUrl();
                    if (currentUrl != null) {
                        String currentHost = Uri.parse(currentUrl).getHost();
                        String targetHost = Uri.parse(url).getHost();
                        if (currentHost != null && currentHost.equals(targetHost)) {
                            return false; // Keep inside WebView
                        }
                    }
                } catch (Exception e) {
                    // Ignore
                }

                // Local test / prod domains
                if (url.contains("daniewatch-downloader.vercel.app") || 
                    url.contains("localhost") || 
                    url.contains("127.0.0.1") || 
                    url.contains("10.0.2.2") ||
                    url.contains("192.168.100.125")) {
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
                // Inject bridge marker so website detects the app environment
                view.evaluateJavascript(
                    "if(!window.DanieWatchBridge){window.DanieWatchBridge={_native:true};}",
                    null
                );
            }
        });

        // WebChromeClient for progress and console
        mainWebView.setWebChromeClient(new WebChromeClient());

        // Download listener — handles direct file downloads if triggered normally
        mainWebView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition,
                                        String mimeType, long contentLength) {
                new DanieWatchBridge().startDownload(url, "Video Download");
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
            // Keep synchronous method for backward compatibility fallbacks
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
        public void extractVCloudAsync(String vcloudUrl, String callbackName) {
            new Handler(Looper.getMainLooper()).post(() -> {
                vcloudExtractor.extract(MainActivity.this, vcloudUrl,
                    new VCloudExtractor.ExtractCallback() {
                        @Override
                        public void onResult(String jsonResult) {
                            String escapedResult = jsonResult.replace("\\", "\\\\").replace("'", "\\'");
                            String jsCall = String.format(
                                "if(window['%s']){window['%s']('%s', null);}",
                                callbackName, callbackName, escapedResult
                            );
                            mainWebView.evaluateJavascript(jsCall, null);
                        }

                        @Override
                        public void onError(String error) {
                            String escapedError = error.replace("\\", "\\\\").replace("'", "\\'");
                            String jsCall = String.format(
                                "if(window['%s']){window['%s'](null, '%s');}",
                                callbackName, callbackName, escapedError
                            );
                            mainWebView.evaluateJavascript(jsCall, null);
                        }
                    });
            });
        }

        @JavascriptInterface
        public void startDownload(String url, String title) {
            new Handler(Looper.getMainLooper()).post(() -> {
                try {
                    DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                    
                    // Sanitize file name
                    String cleanTitle = title.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
                    String fileName = (cleanTitle.isEmpty() ? "DanieWatch_Video" : cleanTitle) + ".mp4";
                    
                    request.setTitle(cleanTitle.isEmpty() ? "DanieWatch Video" : cleanTitle);
                    request.setDescription("Downloading file from source...");
                    request.setNotificationVisibility(
                        DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                    request.setDestinationInExternalPublicDir(
                        Environment.DIRECTORY_DOWNLOADS, fileName);
                    
                    // Hotlink headers to bypass hotlinking block on CDNs
                    request.addRequestHeader("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
                    request.addRequestHeader("Referer", "https://vcloud.zip/");

                    DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                    if (dm != null) {
                        dm.enqueue(request);
                        Toast.makeText(MainActivity.this,
                            "Download started: " + fileName, Toast.LENGTH_SHORT).show();
                    } else {
                        throw new Exception("Download service not available");
                    }
                } catch (Exception e) {
                    // Fallback to browser intent
                    try {
                        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                        startActivity(intent);
                    } catch (Exception ex) {
                        Toast.makeText(MainActivity.this,
                            "Unable to download file", Toast.LENGTH_SHORT).show();
                    }
                }
            });
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
