# Android Packaging Plan (After Node Installation)

## Packaging approach
Use Capacitor to wrap the existing APSWise PWA into a native Android shell for Play Store distribution.

## Current status
Capacitor Android scaffolding has been initialized in this workspace.

## Commands
```bash
npm run ingest
npm run android:sync
```

Then open in Android Studio:

```bash
npx cap open android
```

## Release checklist
1. Set app name, icon, and splash assets.
2. Set Android package id (`com.unipath.app` or final approved id).
3. Enable HTTPS backend endpoints.
4. Configure Play Store listing, privacy policy, and screenshots.
5. Build signed AAB and publish.
