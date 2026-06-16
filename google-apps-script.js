/**
 * Google Apps Script Web App Proxy for DanieWatch Downloader
 * 
 * This proxy is deployed on Google Apps Script as a Web App (available to "Anyone").
 * Google's IP ranges are highly trusted by Cloudflare WAF, allowing us to fetch 
 * HTML landing pages and token endpoints on vcloud.zip and hubcloud without being 
 * blocked by bot protection or Turnstile challenges.
 */

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  var url = e.parameter.url;
  if (!url) {
    return ContentService.createTextOutput(JSON.stringify({ 
      success: false, 
      error: "Missing URL parameter" 
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  try {
    var headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };
    
    // Forward referer if provided
    if (e.parameter.referer) {
      headers['Referer'] = e.parameter.referer;
    }
    
    // Set up fetch options
    var params = {
      method: e.parameter.method || 'get',
      headers: headers,
      muteHttpExceptions: true,
      followRedirects: false // Allow the caller to trace redirects manually if needed
    };
    
    // Fetch target URL
    var response = UrlFetchApp.fetch(url, params);
    var content = response.getContentText();
    var allHeaders = response.getAllHeaders();
    var statusCode = response.getResponseCode();
    
    // Normalize headers keys to lowercase for standard lookup
    var normalizedHeaders = {};
    for (var key in allHeaders) {
      normalizedHeaders[key.toLowerCase()] = allHeaders[key];
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      status: statusCode,
      content: content,
      headers: normalizedHeaders
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
