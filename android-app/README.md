# DanieWatch Android WebView App

A lightweight Android WebView wrapper for DanieWatch that enables premium VCloud download extraction.

## Features

- **Full-screen WebView** loading `https://daniewatch-downloader.vercel.app/`
- **Native VCloud extraction** via hidden background WebView (bypasses Cloudflare + CORS)
- **Download Manager** integration for direct file downloads
- **JavaScript Bridge** (`window.DanieWatchBridge`) for website ↔ native communication
- **~3-5MB APK size** — no external dependencies, pure Android WebView

## How It Works

1. The app loads the DanieWatch website in a full-screen WebView
2. The website detects `window.DanieWatchBridge` and enables premium VCloud features
3. When a user taps a VCloud resolution button, the website calls `DanieWatchBridge.extractVCloud(url)`
4. The native code spins up a **hidden background WebView** that:
   - Loads the VCloud page (Cloudflare passes because it's a real device browser)
   - Decodes the double-base64 token: `atob(atob('...'))`
   - Follows the redirect to the token page
   - Extracts all server download links (FSL, FSLv2, HubCloud, etc.)
5. Returns the server links as JSON to the website
6. The website picks the best server and triggers the download

## Building

### Prerequisites
- Android Studio (Arctic Fox or later)
- Android SDK 34
- Java 8+

### Steps

1. Open `android-app/` folder in Android Studio
2. Let Gradle sync complete
3. Add your app icon:
   - Right-click `res` → New → Image Asset
   - Use your DanieWatch logo
4. Build the APK:
   - **Debug**: `./gradlew assembleDebug` → output in `app/build/outputs/apk/debug/`
   - **Release**: `./gradlew assembleRelease` → output in `app/build/outputs/apk/release/`

### Signing for Release

To build a signed release APK:

```bash
# Generate a keystore (one-time)
keytool -genkey -v -keystore daniewatch-release.keystore -alias daniewatch -keyalg RSA -keysize 2048 -validity 10000

# Add to your local.properties or gradle.properties:
# RELEASE_STORE_FILE=path/to/daniewatch-release.keystore
# RELEASE_STORE_PASSWORD=your_password
# RELEASE_KEY_ALIAS=daniewatch
# RELEASE_KEY_PASSWORD=your_password
```

## Project Structure

```
android-app/
├── build.gradle              # Root Gradle config
├── settings.gradle           # Project settings
├── app/
│   ├── build.gradle          # App build config (minSdk 24, targetSdk 34)
│   ├── proguard-rules.pro    # ProGuard rules for JS bridge
│   └── src/main/
│       ├── AndroidManifest.xml
│       ├── java/com/daniewatch/app/
│       │   ├── MainActivity.java      # WebView + JS bridge + download handler
│       │   └── VCloudExtractor.java   # Background WebView extraction engine
│       └── res/
│           ├── values/
│           │   ├── strings.xml
│           │   └── themes.xml
│           └── xml/
│               └── network_security_config.xml
```
