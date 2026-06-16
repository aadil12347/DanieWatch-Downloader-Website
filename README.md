# DanieWatch Downloader Website - Production Setup Guide

This guide describes how to run and configure the DanieWatch Downloader Website in production environments (like Vercel, Netlify, etc.).

---

## 1. Why is a Proxy Needed in Production?

1. **Cloudflare Bot Protection**: VCloud (`vcloud.zip`) uses Cloudflare Turnstile/Bot management. While requests from residential IPs (your local machine) pass easily, serverless/datacenter IPs (AWS/Vercel) are blocked. This prevents size fetching and download link extraction when deployed.
2. **Vercel Serverless Limits**: Piping large files (movies/shows, often 500MB - 3GB) through Next.js serverless routes hits limits on response size (4.5MB limit on Vercel Hobby) and execution timeouts (10 seconds), causing downloads to fail or cut off early.
3. **CORS & Referer Requirements**: Browsers cannot fetch from `vcloud.zip` directly due to CORS. Also, video CDNs check for a specific `Referer` (like `https://videodownloader.site/` or `https://vcloud.zip/`). If you redirect the browser to the video URL directly, it will fail due to hotlink protection.

---

## 2. The Cloudflare Worker Solution (Zero Vercel Load)

To solve this, we deploy a free **Cloudflare Worker** as a proxy:
- Cloudflare Workers run on Cloudflare's own network, so they easily bypass standard WAF/Turnstile challenges on `vcloud.zip`.
- Cloudflare Workers support **unlimited stream durations** and **no response size limits**, allowing them to stream multi-GB video files perfectly.
- To prevent putting any bandwidth or streaming load on Vercel, when a user starts a download, Vercel returns a tiny `307 Temporary Redirect` header. The user's browser is redirected to the Cloudflare Worker, which streams the video file directly. **Vercel's bandwidth consumption is 0%!**

---

## 3. Deployment Instructions (Free & Fast)

### Step 1: Deploy the Cloudflare Worker
1. Log in to your [Cloudflare Dashboard](https://dash.cloudflare.com/) (free account).
2. Go to **Workers & Pages** -> **Create Application** -> **Create Worker**.
3. Name your worker (e.g., `danie-watch-proxy`) and click **Deploy**.
4. Click **Edit Code**, delete the default code, and copy-paste the entire contents of [cloudflare-worker.js](file:///E:/0.1%20Github%20Repo/Vcoud%20Databse%20Links/cloudflare-worker.js).
5. Click **Save and Deploy**.
6. Copy your Worker's URL (e.g., `https://danie-watch-proxy.your-subdomain.workers.dev`).

### Step 2: Configure Environment Variables on Vercel/Netlify
Set the following environment variable in your production hosting panel (Vercel, Netlify, etc.):

| Variable Name | Value | Description |
|---|---|---|
| `CLOUDFLARE_WORKER_PROXY_URL` | `https://danie-watch-proxy.your-subdomain.workers.dev` | The URL of your deployed Cloudflare Worker (do NOT include a trailing slash). |
| `GITHUB_TOKEN` | *Your GitHub Personal Access Token* (Optional) | Helps prevent rate limit errors on the Git Trees API when loading stream files list. |

*Once the environment variable is configured, redeploy your Next.js application.*

---

## 4. Local Development

On `localhost`, if `CLOUDFLARE_WORKER_PROXY_URL` is not configured, the website automatically falls back to **direct fetching** for size scraping and link extraction. This makes development zero-configuration, while production is highly scalable and robust.
