# ForgeX AI — Android Mobile Deployment & Capacitor APK Guide

This guide details how to build, install, and run **ForgeX AI** as an Android application (`APK`) on mobile devices and industrial tablets, and connect it to your ForgeX SaaS or On-Premises Enterprise server.

---

## 1. Prerequisites

Before building the Android APK, ensure your development workstation has:

1. **Node.js 20+** and **pnpm** (or npm).
2. **JDK 17**:
   - Recommended: The bundled OpenJDK inside Android Studio (`jbr/`).
   - Alternatively: Eclipse Temurin 17 or Amazon Corretto 17.
   - Ensure `JAVA_HOME` environment variable points to your JDK directory:
     ```powershell
     # Windows PowerShell example
     $env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
     ```
3. **Android Studio** (Koala, Ladybug, or newer):
   - Install the **Android SDK** (API Level 34 or 35 recommended).
   - Install **Android SDK Build-Tools** and **Android SDK Platform-Tools** (for `adb`).
   - Ensure `ANDROID_HOME` or `ANDROID_SDK_ROOT` is set in your environment:
     ```powershell
     # Windows PowerShell example
     $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
     ```
4. **Android Device** (Android 8.0 Oreo / API 26 or higher):
   - Developer Options enabled (`Settings` → `About phone` → tap `Build number` 7 times).
   - **USB Debugging** enabled under `Developer options`.

---

## 2. Architecture & Native Features

The Android package is built using **Capacitor 8**:

- **Local Web Bundle**: The built web application (`apps/web/dist`) is bundled directly inside the APK assets (`android/app/src/main/assets/public`). It loads instantly without depending on an internet connection for UI assets.
- **Native Platform Detection (`isNative()`)**:
  - Automatically skips Service Worker registration (the app is already bundled).
  - Suppresses external Google Identity Services (`accounts.google.com/gsi`) scripts.
  - Automatically launches the **"Connect to your workspace"** flow on first launch whenever no server is configured.
  - The API client resolves all requests to the configured workspace server (`baseUrl`) without relying on a same-origin backend.
- **Hardware Back Button**:
  - The Android hardware back button traverses the in-app view and tab history.
  - The application only exits when the user presses back from the root module.
- **Status Bar**: Styled with the dark industrial navy theme (`#0f172a`), with web content positioned cleanly below the system status bar.
- **Permissions Declared**:
  - `INTERNET`: For connecting to ForgeX API servers over LAN, VPN, or Cloud.
  - `CAMERA`: For asset QR code scanning, P&ID visual diagnostics, gauge inspections, and LOTO safety photos.
  - `RECORD_AUDIO` & `MODIFY_AUDIO_SETTINGS`: For microphone and ambient sound diagnostics.
  - Camera hardware features marked optional (`required="false"`) so devices without physical cameras can still install the app.
  - `android:usesCleartextTraffic="true"`: Enabled to permit testing over local development LAN addresses (`http://192.168.x.x:4000`).

---

## 3. Running the Server & HTTPS Tunnel for Mobile

Mobile devices run in an isolated network sandbox. When running the ForgeX API locally on your PC, your phone needs network access to port `4000`.

### Option A: HTTPS Reverse Tunnel (Recommended)
Android enforces HTTPS by default. Using an HTTPS tunnel avoids SSL certificate warnings and firewall issues:

```bash
# Using Cloudflare Tunnel (Free, no account needed)
cloudflared tunnel --url http://localhost:4000

# Or using ngrok
ngrok http 4000
```
Copy the generated HTTPS URL (e.g. `https://random-subdomain.trycloudflare.com`).

### Option B: Local Wi-Fi LAN
If your phone and PC are connected to the same Wi-Fi router:
1. Find your workstation's local IP address (`ipconfig` on Windows or `ifconfig` on macOS/Linux, e.g., `192.168.1.100`).
2. Start the API bound to `0.0.0.0` (default in ForgeX):
   ```bash
   npm run dev:api
   ```
3. Use `http://192.168.1.100:4000` as your server URL.

### Configuring API CORS
Ensure the API allows requests from Capacitor native origins. In `apps/api/.env`:
```env
ALLOWED_ORIGINS=https://localhost,capacitor://localhost,http://localhost,http://localhost:5173,https://your-tunnel-url.trycloudflare.com
```

---

## 4. Building the Android Debug APK

### Step 1: Build the Web App & Sync Native Assets
From the repository root:
```bash
# 1. Build the frontend web application bundle
npm --prefix apps/web run build

# 2. Sync web assets, plugins, and configs into the Android project
npm --prefix apps/web run android:sync
```

### Step 2: Assemble the APK

#### Method 1: Using Gradle CLI
```bash
# From apps/web directory:
cd apps/web/android
.\gradlew.bat assembleDebug

# (On Linux / macOS: ./gradlew assembleDebug)
```

#### Method 2: Using Android Studio
```bash
# Opens the native Android project in Android Studio
npm --prefix apps/web run android:open
```
1. Wait for Gradle sync to complete.
2. In the top menu, click **Build** → **Build Bundle(s) / APK(s)** → **Build APK(s)**.

### Output Artifact Location
Upon successful build, the compiled `.apk` file is generated at:
```
apps/web/android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 5. Installing the APK on Your Phone

### Method A: Via USB Debugging (Fastest)
1. Connect your Android phone to your PC via USB.
2. Verify your device is recognized:
   ```bash
   adb devices
   ```
3. Install the APK directly:
   ```bash
   adb install -r "apps/web/android/app/build/outputs/apk/debug/app-debug.apk"
   ```

### Method B: Manual File Transfer
1. Copy `app-debug.apk` to your phone via USB cable, Google Drive, or shared folder.
2. On your phone, open your **Files** app and tap `app-debug.apk`.
3. If prompted, allow **"Install unknown apps"** for your file browser.
4. Tap **Install** and then **Open**.

---

## 6. First-Launch Connection Flow

When launching the ForgeX app for the first time:

1. **Workspace Connection Screen**:
   - The app detects native execution with no stored server config and presents the **"Connect to your workspace"** screen.
2. **Select Connection Type**:
   - **ForgeX Cloud (SaaS)**: Tap **"Connect to ForgeX Cloud"** to connect to the global cloud SaaS cluster (`https://api.forgex.industrial.ai`).
   - **My Company Server (Enterprise)**:
     - **Scan QR Code**: Tap **"Scan Workspace QR Code"**, grant camera access, and scan the onboarding QR code generated by an administrator in **Settings → Organization**.
     - **Manual Entry**: Enter your server URL (e.g. `https://your-tunnel.trycloudflare.com` or `http://192.168.1.100:4000`) and optional company code.
3. **Validation & Binding**:
   - The app verifies `<server>/api/config/public` within 8 seconds.
   - Upon confirmation, it displays the verified workspace name and mode, saves configuration to local storage, and opens the login view.
4. **Login**:
   - Sign in using your work email & password or email OTP.
   - *(Note: Google Sign-In is disabled in the native mobile container; use email OTP or credentials)*.
5. **Switching Workspaces**:
   - Go to **Settings** → **Personal Profile** → **Connected Workspace Server**.
   - Tap **"Switch Workspace"** to clear the session and connect to another plant or cloud server.

---

## 7. Troubleshooting Table

| Issue / Symptom | Root Cause | Solution |
| :--- | :--- | :--- |
| **White screen on launch** | Built web assets missing from `android/app/src/main/assets/public`. | Run `npm --prefix apps/web run build` followed by `npx cap sync android` in `apps/web`. |
| **"CORS or Network Failure" on connect** | API does not permit Capacitor or phone origin. | Add `https://localhost`, `capacitor://localhost`, and `http://localhost` to `ALLOWED_ORIGINS` in `apps/api/.env`. |
| **"Cleartext HTTP connection failed"** | Android blocks insecure `http://` network traffic by default. | Use an HTTPS tunnel (`cloudflared` / `ngrok`) or verify `android:usesCleartextTraffic="true"` is set in `AndroidManifest.xml`. |
| **Camera black / viewfinder not opening** | Android runtime camera permission was denied. | Open Android **Settings** → **Apps** → **ForgeX** → **Permissions** → set **Camera** to **Allow only while using the app**. |
| **Server unreachable (timed out after 8s)** | Phone cannot route to the entered server IP address. | Verify phone is on the same Wi-Fi subnet. Check that port 4000 is open in the Windows Defender / OS firewall. |
| **Gradle download timeout during build** | Machine has limited internet or proxy blocking `services.gradle.org`. | Open the project in Android Studio (`npm run android:open`); Android Studio will use its configured proxy and JDK to build. |
| **Voice dictation displays fallback notice** | Web Speech API is not implemented in Android System WebView. | The app automatically displays a friendly notice and keeps the text input active with zero crashes. |
