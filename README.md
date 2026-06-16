# DanieWatch Downloader Website - Production Setup Guide

This guide describes how to run and configure the DanieWatch Downloader Website in production environments (like Vercel, Netlify, etc.) using our hybrid proxy setup.

---

## 1. Why is a Proxy Needed in Production?

1. **Cloudflare Bot Protection**: VCloud (`vcloud.zip`) uses Cloudflare Turnstile/Bot management. While requests from residential IPs (your local machine) pass easily, serverless/datacenter IPs (AWS/Vercel) and Cloudflare Workers (which carry `CF-Worker` headers) are blocked or redirected. This prevents size fetching and download link extraction when deployed.
2. **Vercel Serverless Limits**: Piping large files (movies/shows, often 500MB - 3GB) through Next.js serverless routes hits limits on response size (4.5MB limit on Vercel Hobby) and execution timeouts (10 seconds), causing downloads to fail or cut off early.
3. **CORS & Referer Requirements**: Browsers cannot fetch from `vcloud.zip` directly due to CORS. Also, video CDNs check for a specific `Referer` (like `https://videodownloader.site/` or `https://vcloud.zip/`). If you redirect the browser to the video URL directly, it will fail due to hotlink protection.

---

## 2. Hybrid Proxy Architecture (Zero Vercel Load & Turnstile Bypass)

To achieve 100% reliable automated background downloads without sending the user to `vcloud.zip` pages, we deploy a hybrid proxy system:

1. **Google Apps Script Proxy (`google-apps-script.js`)**: Used for scraping HTML and tracing redirects. Google's IP ranges are fully whitelisted by Cloudflare WAF to prevent breaking search indexers and Workspace integrations. Since it doesn't carry `CF-Worker` flags, it bypasses Turnstile completely.
2. **Cloudflare Worker Proxy (`cloudflare-worker.js`)**: Used to stream the final video files. The Worker supports unlimited stream durations, handles HTTP Range requests (for video player seeking), and injects referrer headers. When a user downloads, Vercel redirects them to the Worker with a `307` code, consuming **0% Vercel bandwidth**.

---

## 3. Deployment Instructions (Free & Fast)

### Step 1: Deploy the Google Apps Script HTML Proxy
1. Log in to [script.google.com](https://script.google.com/) using a Google account.
2. Click **New Project** and rename it to `DanieWatch HTML Scraper Proxy`.
3. Clear the default `Code.gs` and copy-paste the entire contents of [google-apps-script.js](file:///E:/0.1%20Github%20Repo/Vcoud%20Databse%20Links/google-apps-script.js).
4. Click **Save** (disk icon).
5. Click **Deploy** -> **New Deployment**. Select **Web App** as the type (click the gear icon next to "Select type").
6. Configure:
   * **Execute as**: `Me (your-email@gmail.com)`
   * **Who has access**: `Anyone`
7. Click **Deploy**. Authorize permissions if prompted by Google.
8. Copy the generated **Web App URL** (e.g., `https://script.google.com/macros/s/XXXXXX/exec`).

### Step 2: Deploy the Cloudflare Worker Stream Proxy
1. Log in to your [Cloudflare Dashboard](https://dash.cloudflare.com/) (free account).
2. Go to **Workers & Pages** -> **Create Application** -> **Create Worker**.
3. Name your worker (e.g., `danie-watch-proxy`) and click **Deploy**.
4. Click **Edit Code**, delete the default code, and copy-paste the entire contents of [cloudflare-worker.js](file:///E:/0.1%20Github%20Repo/Vcoud%20Databse%20Links/cloudflare-worker.js).
5. Click **Save and Deploy**.
6. Copy your Worker's URL (e.g., `https://danie-watch-proxy.your-subdomain.workers.dev`).

### Step 3: Configure Environment Variables on Vercel/Netlify
Set the following environment variables in your production hosting panel:

| Variable Name | Value | Description |
|---|---|---|
| `GOOGLE_SCRIPT_PROXY_URL` | `https://script.google.com/macros/s/XXXXXX/exec` | The URL of your deployed Google Apps Script Web App (from Step 1). |
| `CLOUDFLARE_WORKER_PROXY_URL` | `https://danie-watch-proxy.your-subdomain.workers.dev` | The URL of your deployed Cloudflare Worker (from Step 2). Do NOT include a trailing slash. |
| `GITHUB_TOKEN` | *Your GitHub Personal Access Token* (Optional) | Helps prevent rate limit errors on the Git Trees API when loading stream files list. |

*Once the environment variables are configured, redeploy your Next.js application.*

---

## 4. Local Development

On `localhost`, if `GOOGLE_SCRIPT_PROXY_URL` is not configured, the website automatically falls back to standard/Cloudflare Worker fetching. This makes development zero-configuration, while production is highly scalable and robust.
