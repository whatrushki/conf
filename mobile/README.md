# Mobile (Expo) shell

Thin React Native / Expo app that loads the deployed WHAT CONF web client in a WebView
(with camera / mic permissions).

## Local

```bash
cd mobile
npm install
npx expo install expo-build-properties
# set URL
# Windows PowerShell:
$env:EXPO_PUBLIC_WEB_URL="https://your-pages-url"
npx expo start
```

For a local APK:

```bash
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
```

## CI release APK

Workflow: `.github/workflows/release-apk.yml`

1. Set repository variable `WEB_APP_URL` to your GitHub Pages URL
2. Create a GitHub Release (tag) — the workflow builds APK and attaches it
