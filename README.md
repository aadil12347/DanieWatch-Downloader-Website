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

1. **Scrape.do API Proxy**: Used for HTML scraping and redirect hops tracing. Scrape.do rotates residential proxies and solves Cloudflare Turnstile challenges automatically on their free tier (5,000 free requests per month, no credit card required). Since it requests pages from residential-looking connections, it bypasses Turnstile completely.
2. **Cloudflare Worker Proxy (`cloudflare-worker.js`)**: Used to stream the final video files. The Worker supports unlimited stream durations, handles HTTP Range requests (for video player seeking), and injects referrer headers. When a user downloads, Vercel redirects them to the Worker with a `307` code, consuming **0% Vercel bandwidth**.

---

## 3. Deployment Instructions (Free & Fast)

### Step 1: Get a Free Scrape.do Token
1. Go to [Scrape.do](https://scrape.do/) and sign up for a free account (no credit card required).
2. Copy your **API Token** from the Scrape.do dashboard.

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
| `SCRAPE_DO_TOKEN` | *Your Scrape.do API Token* | The API token obtained from your Scrape.do dashboard (from Step 1). |
| `CLOUDFLARE_WORKER_PROXY_URL` | `https://danie-watch-proxy.your-subdomain.workers.dev` | The URL of your deployed Cloudflare Worker (from Step 2). Do NOT include a trailing slash. |
| `GITHUB_TOKEN` | *Your GitHub Personal Access Token* (Optional) | Helps prevent rate limit errors on the Git Trees API when loading stream files list. |

*Once the environment variables are configured, redeploy your Next.js application.*

---

## 4. Local Development

On `localhost`, if `SCRAPE_DO_TOKEN` is not configured, the website automatically falls back to standard direct fetching. Since your local computer uses a residential IP connection, it will automatically bypass VCloud's Turnstile block without consuming your Scrape.do free quota!
