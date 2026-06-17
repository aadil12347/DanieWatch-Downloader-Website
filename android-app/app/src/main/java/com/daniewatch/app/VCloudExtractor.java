package com.daniewatch.app;

import android.content.Context;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * VCloudExtractor — Handles background WebView extraction of VCloud download links.
 *
 * Flow:
 * 1. Load the VCloud page URL in a hidden WebView
 * 2. Once loaded, inject JS to find the token URL (using single/double atob or var matches)
 * 3. Load that token URL with the correct Referer header
 * 4. Once loaded, inject JS to extract Server 1 (FSL), Server 2 (FSLv2), and Server 3 (HubCloud) links
 * 5. Apply time obfuscation suffixes (UTC minutes) to Server 1 and Server 2 links matching Next.js route logic
 * 6. Spin up a background thread to trace HubCloud redirect chain for Server 3 to fetch direct link
 * 7. Return the final resolved server links JSON to the callback
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

        // Timeout after 28 seconds
        final boolean[] completed = {false};
        mainHandler.postDelayed(() -> {
            if (!completed[0]) {
                completed[0] = true;
                callback.onError("Extraction timed out after 28 seconds.");
                cleanup();
            }
        }, 28000);

        hiddenWebView.setWebViewClient(new WebViewClient() {
            boolean isSecondStage = false;
            String originalUrl = vcloudUrl;

            @Override
            public void onPageFinished(WebView view, String url) {
                if (completed[0]) return;

                if (!isSecondStage) {
                    // PHASE 1: Extract the token URL
                    String extractTokenJS = 
                        "(function() {" +
                        "  try {" +
                        "    var html = document.documentElement.innerHTML;" +
                        "    " +
                        "    // 1. Check var url = '...'" +
                        "    var m1 = html.match(/var\\s+url\\s*=\\s*['\"](https?:\\/\\/[^'\"]+)['\"]/i);" +
                        "    if (m1 && m1[1]) return m1[1];" +
                        "    " +
                        "    // 2. Check id=\"download\" or download text matches" +
                        "    var links = document.querySelectorAll('a');" +
                        "    for (var i = 0; i < links.length; i++) {" +
                        "      var a = links[i];" +
                        "      var id = a.getAttribute('id') || '';" +
                        "      var text = (a.textContent || '').toLowerCase();" +
                        "      if (id === 'download' || text.indexOf('generate direct download') !== -1 || text.indexOf('generate download') !== -1) {" +
                        "        var href = a.href;" +
                        "        if (href && href.startsWith('http')) return href;" +
                        "      }" +
                        "    }" +
                        "    " +
                        "    // 3. Check double atob" +
                        "    var m3 = html.match(/atob\\(atob\\(['\"]([A-Za-z0-9+\\/=]+)['\"]\\)\\)/i);" +
                        "    if (m3 && m3[1]) return atob(atob(m3[1]));" +
                        "    " +
                        "    // 4. Check single atob" +
                        "    var m4 = html.match(/url\\s*=\\s*atob\\(['\"]([A-Za-z0-9+\\/=]+)['\"]\\)/i);" +
                        "    if (m4 && m4[1]) return atob(m4[1]);" +
                        "    " +
                        "    // 5. Fallback check for relative URLs inside var url" +
                        "    var m5 = html.match(/var\\s+url\\s*=\\s*['\"]([^'\"]+)['\"]/i);" +
                        "    if (m5 && m5[1]) {" +
                        "      if (m5[1].startsWith('http')) return m5[1];" +
                        "      var l = document.createElement('a');" +
                        "      l.href = m5[1];" +
                        "      return l.href;" +
                        "    }" +
                        "    " +
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
                            // Maybe the page already has the server links directly
                            extractServersDirectly(view, callback, completed, 0);
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
                    // Wait a moment for any dynamically rendered content
                    mainHandler.postDelayed(() -> {
                        extractServersDirectly(view, callback, completed, 0);
                    }, 1500);
                }
            }
        });

        // Load the initial VCloud URL
        hiddenWebView.loadUrl(vcloudUrl);
    }

    /**
     * Extract server links from the current page content with retry polling support.
     */
    private void extractServersDirectly(WebView view, ExtractCallback callback, boolean[] completed, int retryCount) {
        String extractServersJS =
            "(function() {" +
            "  try {" +
            "    var servers = {};" +
            "    var links = document.querySelectorAll('a[href]');" +
            "    // CRITICAL: Must use UTC minutes to align with server validation times globally" +
            "    var currentMinute = new Date().getUTCMinutes();" +
            "    " +
            "    var AD_KEYWORDS = ['bit.ly', 'tinyurl', 'cutt.ly', 'linkvertise', 'adf.ly', 'shorturl', 'doubleclick', 'popads', 'onclickads', 'exoclick', 'adsterra', 'adlink', 'winexch', 'lotus', 'bet', 'casino', '1xbet', 'mostbet', 'parimatch', 'melbet', 'dafanews', 'sportybet', 'betway', 'bet365', 'adsystem', 'adservices', 'googlesyndication', 'googleadservices'];" +
            "    " +
            "    var suffix1 = '1' + currentMinute;" +
            "    var suffix2 = '_1' + currentMinute;" +
            "    " +
            "    for (var i = 0; i < links.length; i++) {" +
            "      var a = links[i];" +
            "      var href = a.getAttribute('href');" +
            "      if (!href || href === '#' || href.startsWith('javascript:')) continue;" +
            "      " +
            "      var absoluteHref = a.href;" +
            "      var hrefLower = absoluteHref.toLowerCase();" +
            "      " +
            "      // Filter non-media links" +
            "      if (hrefLower.indexOf('css') !== -1 || hrefLower.indexOf('fonts') !== -1 || " +
            "          hrefLower.indexOf('favicon') !== -1 || hrefLower.indexOf('manifest') !== -1 || " +
            "          hrefLower.indexOf('telegram') !== -1 || hrefLower.indexOf('t.me') !== -1 || " +
            "          hrefLower.indexOf('/tg/') !== -1 || hrefLower.indexOf('google.com') !== -1 ||" +
            "          hrefLower.indexOf('github.com') !== -1 || hrefLower.indexOf('admin') !== -1 ||" +
            "          hrefLower.indexOf('login') !== -1 || hrefLower.indexOf('signup') !== -1 ||" +
            "          hrefLower.indexOf('hubcloud.php') !== -1) {" +
            "        continue;" +
            "      }" +
            "      " +
            "      // Filter ads" +
            "      var isAd = false;" +
            "      for (var k = 0; k < AD_KEYWORDS.length; k++) {" +
            "        if (hrefLower.indexOf(AD_KEYWORDS[k]) !== -1) { isAd = true; break; }" +
            "      }" +
            "      if (isAd) continue;" +
            "      " +
            "      var id = (a.getAttribute('id') || '').trim();" +
            "      var innerHtml = a.innerHTML || '';" +
            "      " +
            "      // Server 1 (FSL): appends '1' + currentMinute unless cloudflare storage links" +
            "      if (id === 'fsl' || innerHtml.indexOf('[FSL Server]') !== -1) {" +
            "        if (hrefLower.indexOf('x-amz-signature') !== -1 || hrefLower.indexOf('r2.cloudflarestorage') !== -1 || hrefLower.indexOf('r2.dev') !== -1) {" +
            "          servers['Server 1'] = absoluteHref;" +
            "        } else {" +
            "          // Prevent double appending if already suffix matches" +
            "          if (absoluteHref.endsWith(suffix1)) {" +
            "            servers['Server 1'] = absoluteHref;" +
            "          } else {" +
            "            servers['Server 1'] = absoluteHref + suffix1;" +
            "          }" +
            "        }" +
            "      }" +
            "      // Server 2 (FSLv2): appends '_1' + currentMinute unless cloudflare storage links" +
            "      else if (id === 's3' || innerHtml.indexOf('[FSLv2 Server]') !== -1) {" +
            "        if (hrefLower.indexOf('x-amz-signature') !== -1 || hrefLower.indexOf('r2.cloudflarestorage') !== -1 || hrefLower.indexOf('r2.dev') !== -1) {" +
            "          servers['Server 2'] = absoluteHref;" +
            "        } else {" +
            "          // Prevent double appending if already suffix matches" +
            "          if (absoluteHref.endsWith(suffix2)) {" +
            "            servers['Server 2'] = absoluteHref;" +
            "          } else {" +
            "            servers['Server 2'] = absoluteHref + suffix2;" +
            "          }" +
            "        }" +
            "      }" +
            "      // Server 3 (HubCloud)" +
            "      else if (" +
            "        innerHtml.indexOf('[Server : 10Gbps]') !== -1 || " +
            "        hrefLower.indexOf('pixel.hubcloud') !== -1 || " +
            "        hrefLower.indexOf('gpdl') !== -1 || " +
            "        (hrefLower.indexOf('hubcloud') !== -1 && hrefLower.indexOf('id=') !== -1)" +
            "      ) {" +
            "        servers['Server 3'] = absoluteHref;" +
            "      }" +
            "    }" +
            "    return JSON.stringify(servers);" +
            "  } catch(e) { return JSON.stringify({error: e.message}); }" +
            "})()";

        view.evaluateJavascript(extractServersJS, result -> {
            if (completed[0]) return;

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
                // Poll retry up to 6 times (3 seconds total) for async DOM updates
                if (retryCount < 6) {
                    mainHandler.postDelayed(() -> {
                        extractServersDirectly(view, callback, completed, retryCount + 1);
                    }, 500);
                } else {
                    completed[0] = true;
                    callback.onError("No download server links found on page.");
                    cleanup();
                }
            } else {
                final String initialResult = result;
                
                // Trace redirects in background thread
                new Thread(() -> {
                    String finalResult = initialResult;
                    try {
                        JSONObject json = new JSONObject(initialResult);
                        if (json.has("Server 3")) {
                            String server3Url = json.getString("Server 3");
                            String directUrl = traceHubCloudRedirect(server3Url);
                            if (directUrl != null && !directUrl.isEmpty()) {
                                json.put("Server 3", directUrl);
                                finalResult = json.toString();
                            }
                        }
                    } catch (Exception e) {
                        e.printStackTrace();
                    }

                    final String callbackResult = finalResult;
                    mainHandler.post(() -> {
                        if (!completed[0]) {
                            completed[0] = true;
                            callback.onResult(callbackResult);
                            cleanup();
                        }
                    });
                }).start();
            }
        });
    }

    /**
     * Follow redirects for HubCloud (Server 3) links.
     */
    private String traceHubCloudRedirect(String initialUrl) {
        String currentUrl = initialUrl;
        int hops = 0;
        String userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

        while (hops < 10) {
            try {
                Uri uri = Uri.parse(currentUrl);
                String linkParam = uri.getQueryParameter("link");
                if (linkParam != null && !linkParam.isEmpty()) {
                    return linkParam;
                }

                URL url = new URL(currentUrl);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setInstanceFollowRedirects(false); // Manual redirect follow
                conn.setRequestProperty("User-Agent", userAgent);
                conn.setConnectTimeout(8000);
                conn.setReadTimeout(8000);

                int status = conn.getResponseCode();
                if (status >= 300 && status < 400) {
                    String location = conn.getHeaderField("Location");
                    if (location != null) {
                        if (!location.startsWith("http")) {
                            URL base = new URL(currentUrl);
                            location = new URL(base, location).toString();
                        }
                        currentUrl = location;
                        hops++;
                        conn.disconnect();
                        continue;
                    }
                }

                // Read page body to check for JS window.location or HTML meta refreshes
                BufferedReader in = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                StringBuilder body = new StringBuilder();
                String inputLine;
                while ((inputLine = in.readLine()) != null) {
                    body.append(inputLine).append("\n");
                }
                in.close();
                conn.disconnect();

                String bodyStr = body.toString();
                
                Pattern jsLocPattern = Pattern.compile("window\\.location\\s*=\\s*['\"](https?://[^'\"]+)['\"]", Pattern.CASE_INSENSITIVE);
                Pattern jsLocHrefPattern = Pattern.compile("window\\.location\\.href\\s*=\\s*['\"](https?://[^'\"]+)['\"]", Pattern.CASE_INSENSITIVE);
                Pattern metaRefreshPattern = Pattern.compile("<meta\\s+http-equiv=[\"']refresh[\"']\\s+content=[\"']\\d+;\\s*url=([^\"']+)[\"']", Pattern.CASE_INSENSITIVE);

                Matcher m1 = jsLocPattern.matcher(bodyStr);
                Matcher m2 = jsLocHrefPattern.matcher(bodyStr);
                Matcher m3 = metaRefreshPattern.matcher(bodyStr);

                String nextUrl = null;
                if (m1.find()) {
                    String val = m1.group(1);
                    if (!val.contains("bonuscaf.com") && !val.contains("go/")) {
                        nextUrl = val;
                    }
                }
                if (nextUrl == null && m2.find()) {
                    String val = m2.group(1);
                    if (!val.contains("bonuscaf.com") && !val.contains("go/")) {
                        nextUrl = val;
                    }
                }
                if (nextUrl == null && m3.find()) {
                    nextUrl = m3.group(1);
                }

                if (nextUrl != null) {
                    if (!nextUrl.startsWith("http")) {
                        URL base = new URL(currentUrl);
                        nextUrl = new URL(base, nextUrl).toString();
                    }
                    currentUrl = nextUrl;
                    hops++;
                } else {
                    break;
                }

            } catch (Exception e) {
                e.printStackTrace();
                break;
            }
        }

        try {
            Uri uri = Uri.parse(currentUrl);
            String linkParam = uri.getQueryParameter("link");
            if (linkParam != null && !linkParam.isEmpty()) {
                return linkParam;
            }
        } catch (Exception e) {
            // Ignore
        }

        return currentUrl;
    }

    /**
     * Configure the hidden WebView for background extraction.
     */
    private void configureHiddenWebView(WebView webView) {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT); // Default caching to bypass CloudflareTurnstile
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setBlockNetworkImage(false); // Enable images — critical for Cloudflare challenge!
        
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
