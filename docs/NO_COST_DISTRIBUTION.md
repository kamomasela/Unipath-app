# No-Cost Distribution Guide (UniPath)

This guide helps you distribute UniPath without Play Store or App Store fees.

## Path A: PWA (Recommended first)
Users open a link and install to home screen.

### Why this is best now
1. No store fees.
2. Works on Android and iPhone.
3. Fastest way to reach learners.

### Steps
1. Build web assets:
```bash
cd "/Users/tebogo_msimanga/Documents/Codex folder/unipath-app"
npm run ingest
npm run build:web
```

2. Zip deployable site:
```bash
bash ./tools/package_pwa_bundle.sh
```

3. Host for free using one of:
- Netlify (drag-and-drop the zip contents from `dist/unipath-pwa`)
- Cloudflare Pages (upload folder)
- GitHub Pages (push `www/` as static site)

4. Share the live URL with users.

### Install on phone
- Android (Chrome): menu -> `Install app` or `Add to Home screen`
- iPhone (Safari): Share -> `Add to Home Screen`

## Path B: Direct Android APK sharing
Use this for pilot testing where users can install from file.

### Steps
1. Build release APK:
```bash
cd "/Users/tebogo_msimanga/Documents/Codex folder/unipath-app"
npm run android:sync
npm run android:apk
```

2. Find APK output:
- `android/app/build/outputs/apk/release/app-release.apk`

3. Share APK via:
- Google Drive link
- WhatsApp document
- School portal download link

4. User install flow (Android):
- Download APK
- Enable `Install unknown apps` for browser/files app
- Open APK and install

## Recommendation
Start with Path A (PWA public link), and use Path B for controlled pilot schools where needed.
