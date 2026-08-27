# Android APK (Capacitor)

Веб-сборка (`npm run build` → `dist/`) **вшивается** в APK. `WEB_APP_URL` не нужен.

## Локально

```bash
npm install
npm install @capacitor/core @capacitor/cli @capacitor/android --save
npm run build
npx cap add android   # один раз
npx cap sync android
cd android && ./gradlew assembleRelease
```

APK: `android/app/build/outputs/apk/release/app-release-unsigned.apk`

## CI

Workflow `.github/workflows/release-apk.yml` — на GitHub Release:
1. `npm run build`
2. `cap sync android`
3. `assembleRelease`
4. прикрепляет APK к релизу

Папка `mobile/` (старый Expo WebView) больше не используется для релиза.
