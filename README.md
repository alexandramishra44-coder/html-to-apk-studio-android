# HTML to APK Converter Studio — Android App

This package turns the **frontend** of HTML-to-APK Converter Studio into a real installable Android APK using open-source tooling:

- **Capacitor** (ionic-team/capacitor) — official WebView runtime
- **GitHub Actions + Android SDK** — real Gradle build on GitHub runners
- Patterns inspired by open-source projects such as:
  - [cemcoe/web-to-apk-action](https://github.com/cemcoe/web-to-apk-action)
  - [ionic-team/capacitor](https://github.com/ionic-team/capacitor)
  - Various Capacitor Web-to-APK templates

## What this APK contains

- The full premium dark UI (Dashboard, New Project wizard, Projects, Build screens, etc.)
- It runs as a native WebView app on Android

**Important limitation**  
The actual APK *compilation engine* (Node + Capacitor + Gradle + Android SDK) still needs a server.  
This mobile APK is the **client UI**. Point it at your backend (the `backend/` from the main project) by changing the API base URL.

## How to get a real APK (recommended — no local Android SDK)

1. Create a new GitHub repository.
2. Upload **everything** in this folder (`www/`, `package.json`, `capacitor.config.json`, `.github/`).
3. Go to **Actions → Build Android APK → Run workflow**.
4. Fill in:
   - App name (e.g. `APK Studio`)
   - Package ID (e.g. `com.yourname.apkstudio`)
   - Version
5. Wait ~5–10 minutes.
6. Download the APK from the workflow **Artifacts**.

The workflow uses official open-source actions (`actions/setup-node`, `actions/setup-java`, `android-actions/setup-android`) and Capacitor to produce a genuine debug APK.

## Local build (if you have Android SDK)

```bash
npm install
npx cap add android
npx cap sync android
cd android
./gradlew assembleDebug
```

APK will be at:
`android/app/build/outputs/apk/debug/app-debug.apk`

## Pointing the app at your backend

By default the frontend tries to talk to the same origin or `http://localhost:3001`.

For a real device you must host the backend (from the main `html-to-apk-studio/backend`) and change the API base in `www/app.js`:

```js
const API = 'https://your-backend.example.com';
```

Then rebuild the APK.

## License

Same as the main project (MIT). Capacitor is MIT.
