# APSWise App (Phase 1 MVP)

This is a mobile-first MVP prototype for APSWise.

## What works now
- Subject + mark input
- Input validation
- Grade 11 / Grade 12 selection
- Per-university APS calculation (data-driven rules from `data/approved_rules.json`)
- APS-first course matching, then subject-minimum checks
- Local caching of the last result for basic offline resilience
- PWA install support (home-screen install in mobile browsers)

## Run locally
From the `unipath-app` folder:

```bash
python3 -m http.server 8080
```

Open:

`http://localhost:8080`

## Notes
- The app is dependency-free for fast iteration.

## Rules ingestion pipeline
1. Update official sources in `data/source_registry.json`.
2. Run extraction:

```bash
python3 tools/ingest_rules.py
```

3. Review/edit decisions in `data/approval_decisions.json`.
4. Optional: add course subject minimums in `data/subject_minimum_overrides.json`.
5. Promote approved entries:

```bash
python3 tools/promote_rules.py
```

6. Reload app; it reads `data/approved_rules.json`.

Optional strict mode:

```bash
python3 tools/ingest_rules.py --min-confidence 0.8
```

## Authoritative programme data
`data/programme_catalogue.json` is now the authoritative programme table used by the engine.
For each programme, keep these fields accurate from the latest prospectus:
- `faculty`
- `minimum_aps`
- `competitive_flag`
- `mainstream_or_extended`
- `subject_minimums`

Validation:
```bash
python3 tools/validate_programme_catalogue.py
```

Check source URL health:

```bash
npm run source:health
```

This writes `data/source_health_report.json`.

## Review page
Open `review.html` to inspect pending extraction, set approvals, and download an updated decisions file.

If a source is configured as `type: "prospectus_page"`, ingestion will try to discover prospectus-like PDF links from that page automatically.
If a source is configured as `type: "aps_catalog_page"`, ingestion will crawl matching course-finder pages and extract APS thresholds.

## Android app-store path (next phase)
Capacitor Android scaffolding is now set up in this repo.

Build and sync Android project:

```bash
npm run ingest
npm run android:sync
```

Open Android Studio project:

```bash
npm run android:open
```

Then build signed AAB in Android Studio and publish to Google Play.

Detailed steps:
- `docs/ANDROID_PACKAGING_PLAN.md`

## No-cost distribution (recommended now)
See:
- `docs/NO_COST_DISTRIBUTION.md`

Quick commands:

```bash
npm run pwa:bundle
```

Output:
- `dist/unipath-pwa/` (deployable static files)
- `dist/unipath-pwa.zip` (upload/share package)

Optional direct Android APK for pilots:

```bash
npm run android:apk
```
