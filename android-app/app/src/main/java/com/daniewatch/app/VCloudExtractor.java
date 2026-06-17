package com.daniewatch.app;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.util.HashMap;
import java.util.Map;

/**
 * VCloudExtractor — Handles background WebView extraction of VCloud download links.
 *
 * Flow:
 * 1. Load the VCloud page URL in a hidden WebView
 * 2. Once loaded, inject JS to find the double-base64 token: atob(atob('...'))
 * 3. Decode the token to get the redirect/token page URL
 * 4. Load that token URL with the correct Referer header
 * 5. Once loaded, inject JS to extract all download server links (FSL, FSLv2, HubCloud, etc.)
 * 6. Return the result as JSON to the callback
 */
public class VCloudExtractor {

    private WebView hiddenWebView;
    private Handler mainHandler;

    public interface ExtractCallback {
        void onResult(String jsonResult);
        void onError(String error);
    }

    public VCloudExtractor() {
        mainHandler = new Handler(Looper.getMainLooper());
    }

    /**
     * Extract download server links from a VCloud URL.
     * MUST be called from the main thread.
     */
    public void extract(Context context, String vcloudUrl, ExtractCallback callback) {
        // Clean up any previous extraction
        cleanup();

        hiddenWebView = new WebView(context);
        configureHiddenWebView(hiddenWebView);

        // Timeout after 25 seconds
        final boolean[] completed = {false};
        mainHandler.postDelayed(() -> {
            if (!completed[0]) {
                completed[0] = true;
                callback.onError("Extraction timed out after 25 seconds.");
                cleanup();
            }
        }, 25000);

        hiddenWebView.setWebViewClient(new WebViewClient() {
            boolean isSecondStage = false;
            String originalUrl = vcloudUrl;

            @Override
            public void onPageFinished(WebView view, String url) {
                if (completed[0]) return;

                if (!isSecondStage) {
                    // PHASE 1: Extract the double-base64 encoded token URL
                    String extractTokenJS = 
                        "(function() {" +
                        "  try {" +
                        "    var html = document.documentElement.innerHTML;" +
                        "    // Look for atob(atob('...')) pattern" +
                        "    var m = html.match(/atob\\(atob\\(['\"]([A-Za-z0-9+\\/=]+)['\"]\\)\\)/i);" +
                        "    if (m && m[1]) {" +
                        "      return atob(atob(m[1]));" +
                        "    }" +
                        "    // Fallback: look for direct token URL patterns" +
                        "    var m2 = html.match(/var\\s+url\\s*=\\s*['\"]([^'\"]+\\.html[^'\"]*)['\"]/);" +
                        "    if (m2 && m2[1]) return m2[1];" +
                        "    // Fallback: look for window.location patterns" +
                        "    var m3 = html.match(/window\\.location\\.href\\s*=\\s*['\"]([^'\"]+)['\"]/);" +
                        "    if (m3 && m3[1]) return m3[1];" +
                        "    return null;" +
                        "  } catch(e) { return null; }" +
                        "})()";

                    view.evaluateJavascript(extractTokenJS, tokenUrl -> {
                        if (completed[0]) return;

                        // Remove surrounding quotes from JS result
                        if (tokenUrl != null) {
                            tokenUrl = tokenUrl.replace("\"", "").trim();
                        }

                        if (tokenUrl == null || tokenUrl.equals("null") || tokenUrl.isEmpty()) {
                            // Maybe the page already has the servers directly
                            extractServersDirectly(view, callback, completed);
                            return;
                        }

                        // Phase 2: Load the token URL with Referer
                        isSecondStage = true;
                        Map<String, String> headers = new HashMap<>();
                        headers.put("Referer", originalUrl);
                        view.loadUrl(tokenUrl, headers);
                    });
                } else {
                    // PHASE 2: Extract server download links from the token page
                    // Wait a moment for any JS-rendered content
                    mainHandler.postDelayed(() -> {
                        extractServersDirectly(view, callback, completed);
                    }, 2000);
                }
            }
        });

        // Load the initial VCloud URL
        hiddenWebView.loadUrl(vcloudUrl);
    }

    /**
     * Extract server links from the current page content.
     */
    private void extractServersDirectly(WebView view, ExtractCallback callback, boolean[] completed) {
        String extractServersJS =
            "(function() {" +
            "  try {" +
            "    var servers = {};" +
            "    var html = document.documentElement.innerHTML;" +
            "    " +
            "    // Method 1: Look for labeled download links (FSL Server, etc.)" +
            "    var links = document.querySelectorAll('a[href]');" +
            "    for (var i = 0; i < links.length; i++) {" +
            "      var a = links[i];" +
            "      var href = a.href;" +
            "      var text = (a.textContent || a.innerText || '').trim();" +
            "      " +
            "      // Skip empty or javascript links" +
            "      if (!href || href.startsWith('javascript:')) continue;" +
            "      " +
            "      // Match known server patterns" +
            "      if (text.match(/server\\s*1|fsl\\b|fastdl/i) || href.match(/fastdl|fsl\\./i)) {" +
            "        servers['Server 1'] = href;" +
            "      } else if (text.match(/server\\s*2|fslv?2|hubcloud/i) || href.match(/hubcloud|fslv?2/i)) {" +
            "        servers['Server 2'] = href;" +
            "      } else if (text.match(/server\\s*3|10gbps|gdrive/i) || href.match(/10gbps|gdrive/i)) {" +
            "        servers['Server 3'] = href;" +
            "      } else if (text.match(/download|server/i) && href.match(/https?:\\/\\//)) {" +
            "        var sNum = Object.keys(servers).length + 1;" +
            "        servers['Server ' + sNum] = href;" +
            "      }" +
            "    }" +
            "    " +
            "    // Method 2: Look for onclick handlers with URLs" +
            "    if (Object.keys(servers).length === 0) {" +
            "      var btns = document.querySelectorAll('[onclick]');" +
            "      for (var j = 0; j < btns.length; j++) {" +
            "        var onclick = btns[j].getAttribute('onclick');" +
            "        var urlMatch = onclick.match(/https?:\\/\\/[^'\"\\s]+/);" +
            "        if (urlMatch) {" +
            "          var bText = (btns[j].textContent || '').trim();" +
            "          var sKey = bText || ('Server ' + (Object.keys(servers).length + 1));" +
            "          servers[sKey] = urlMatch[0];" +
            "        }" +
            "      }" +
            "    }" +
            "    " +
            "    // Method 3: Regex fallback on raw HTML" +
            "    if (Object.keys(servers).length === 0) {" +
            "      var urlPattern = /https?:\\/\\/(?:fastdl|hubcloud|fsl|10gbps)[^'\"\\s<>]+/gi;" +
            "      var matches = html.match(urlPattern);" +
            "      if (matches) {" +
            "        for (var k = 0; k < matches.length; k++) {" +
            "          servers['Server ' + (k + 1)] = matches[k];" +
            "        }" +
            "      }" +
            "    }" +
            "    " +
            "    return JSON.stringify(servers);" +
            "  } catch(e) { return JSON.stringify({error: e.message}); }" +
            "})()";

        view.evaluateJavascript(extractServersJS, result -> {
            if (completed[0]) return;
            completed[0] = true;

            if (result != null) {
                // Remove surrounding quotes and unescape
                result = result.replace("\\\"", "\"");
                if (result.startsWith("\"") && result.endsWith("\"")) {
                    result = result.substring(1, result.length() - 1);
                }
                // Unescape any remaining escape sequences
                result = result.replace("\\\\", "\\")
                               .replace("\\/", "/");
            }

            if (result == null || result.equals("null") || result.equals("{}")) {
                callback.onError("No download server links found on page.");
            } else {
                callback.onResult(result);
            }
            cleanup();
        });
    }

    /**
     * Configure the hidden WebView for background extraction.
     */
    private void configureHiddenWebView(WebView webView) {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setBlockNetworkImage(true); // Don't load images for speed
        
        // Use a desktop-like user agent to avoid mobile redirects
        settings.setUserAgentString(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        );
    }

    /**
     * Clean up the hidden WebView.
     */
    public void cleanup() {
        if (hiddenWebView != null) {
            hiddenWebView.stopLoading();
            hiddenWebView.destroy();
            hiddenWebView = null;
        }
    }
}
