# KNX Control — Flutter App

Native iOS & Android companion app for the KNX Control Smart Home system.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Project Setup](#project-setup)
- [Configuration (.env)](#configuration-env)
- [Running the App](#running-the-app)
- [Project Structure](#project-structure)
- [Architecture & State Management](#architecture--state-management)
- [Testing](#testing)
- [Release Preparation](#release-preparation)
  - [iOS / TestFlight](#ios--testflight)
  - [Android / Play Store](#android--play-store)

---

## Prerequisites

| Tool | Minimum Version | Notes |
|------|----------------|-------|
| Flutter SDK | 3.22 | Stable channel |
| Dart SDK | 3.3 | Included with Flutter |
| Xcode | 15 | iOS builds only, macOS |
| Android Studio | 2023.x | Android builds |
| CocoaPods | 1.14 | iOS dependency manager |

Install Flutter: https://docs.flutter.dev/get-started/install

Verify your setup:
```bash
flutter doctor
```

---

## Project Setup

```bash
# 1. Navigate to the flutter-app folder
cd knx-web-app/flutter-app

# 2. Copy the environment template and fill in your backend URL
cp .env.example .env          # then edit BACKEND_URL

# 3. Install Flutter dependencies
flutter pub get

# 4. Run Riverpod code generation (needed after any @riverpod annotation change)
dart run build_runner build --delete-conflicting-outputs

# 5. Download Inter font files and place them in assets/fonts/
#    Inter-Regular.ttf | Inter-Medium.ttf | Inter-SemiBold.ttf | Inter-Bold.ttf
#    Download from: https://fonts.google.com/specimen/Inter
```

---

## Configuration (.env)

The app reads backend URLs from `.env` (debug) and `.env.production` (release):

```dotenv
# .env  — development
BACKEND_URL=http://localhost:3001
BACKEND_WS_URL=ws://localhost:3001

# .env.production  — production (your Raspberry Pi / server)
BACKEND_URL=http://192.168.1.100:3001
BACKEND_WS_URL=ws://192.168.1.100:3001
```

> **Note:** `.env.production` is listed in `.gitignore`. Never commit real server addresses to a public repository.

---

## Running the App

```bash
# List available devices
flutter devices

# Run in debug mode (uses .env)
flutter run

# Run on a specific device
flutter run -d <device-id>

# Run in release mode (uses .env.production)
flutter run --release
```

### Hot Reload / Restart

| Shortcut | Action |
|----------|--------|
| `r` | Hot Reload (keeps state) |
| `R` | Hot Restart (resets state) |
| `q` | Quit |

---

## Project Structure

```text
flutter-app/
├── .env                        ← Development backend URL
├── .env.production             ← Production backend URL (not committed)
├── pubspec.yaml
├── assets/
│   └── fonts/                  ← Inter font family (TTF files)
├── lib/
│   ├── main.dart               ← Entry-point: boots Hive + ProviderScope
│   ├── core/
│   │   ├── api/
│   │   │   └── api_client.dart ← Dio HTTP client (env-aware)
│   │   ├── router/
│   │   │   └── app_router.dart ← go_router: URL scheme mirrors web app
│   │   └── theme/
│   │       └── app_theme.dart  ← Dark theme, AppColors, typography
│   ├── features/
│   │   ├── dashboard/          ← Central info, room cards, widgets
│   │   ├── rooms/              ← Floors, rooms, widget configuration
│   │   ├── setup/              ← KNX gateway, Hue, ETS XML
│   │   └── automation/         ← Routines (time / sunrise / sunset)
│   └── shared/
│       ├── models/             ← Apartment, Floor, Room, KnxFunction …
│       ├── providers/          ← Global Riverpod providers (config, socket)
│       └── widgets/            ← MainShell, shimmer loaders, cards …
└── test/
    ├── core/                   ← API client + model unit tests
    └── features/               ← Widget tests per feature
```

Each feature follows the same three-layer structure:
- `data/` — repository + remote data source
- `domain/` — pure Dart models & business logic
- `presentation/` — screens & widgets (Riverpod consumers)

---

## Architecture & State Management

### Why Riverpod?

| Criterion | Riverpod | Provider | Bloc |
|-----------|----------|----------|------|
| Boilerplate | Low | Medium | High |
| Testability | ✅ Excellent | Good | Excellent |
| Async support | `AsyncNotifier` | Manual | StreamBloc |
| Code generation | `@riverpod` | — | — |
| No BuildContext needed | ✅ | — | — |

Riverpod was chosen because:

1. **`AsyncNotifier` + `FutureProvider`** map perfectly to REST API calls and real-time socket state — the two primary data sources of this app.
2. Code generation (`riverpod_annotation` + `build_runner`) eliminates boilerplate and keeps providers type-safe.
3. `ProviderScope.overrides` makes unit-testing trivial — no mocking frameworks needed to swap out API layers.
4. The app has no deeply nested widget trees that would benefit from Bloc's explicit event/state separation.

### State flow

```
Backend REST API  ──────► configProvider (AsyncNotifier)
                                 │
Backend WebSocket ──────► socketProvider (StreamProvider)
                                 │
                         selectedApartmentSlugProvider (StateProvider)
                                 │
                    ┌────────────┼────────────────┐
                 Dashboard    Rooms           Automation
              (deviceStates) (config)        (automations)
```

### Caching strategy

- On first load: fetch from backend, cache result in Hive.
- On subsequent loads: show Hive cache **immediately** (Shimmer while fresh data arrives).
- Offline: serve from cache, show a banner.

---

## Testing

```bash
# All tests
flutter test

# Specific test file
flutter test test/core/api_client_test.dart

# With coverage
flutter test --coverage
genhtml coverage/lcov.info -o coverage/html
open coverage/html/index.html
```

### Test categories

| Category | Location | Tool |
|----------|----------|------|
| Model unit tests | `test/core/` | `flutter_test` + `mocktail` |
| Provider unit tests | `test/core/` | `ProviderContainer` override |
| Widget tests | `test/features/` | `flutter_test` |

---

## Release Preparation

### iOS / TestFlight

1. Open `ios/Runner.xcworkspace` in Xcode.
2. Set **Bundle Identifier** → `com.yourname.knxcontrol` (Runner target → Signing & Capabilities).
3. Set **Display Name** → `KNX Control`.
4. Add your **Team** and signing certificate.
5. Replace the placeholder icons in `ios/Runner/Assets.xcassets/AppIcon.appiconset/`.
6. Archive & upload via Xcode → Product → Archive → Distribute App.

```bash
# Command-line build for TestFlight
flutter build ipa --release
# Output: build/ios/ipa/knx_control.ipa
```

### Android / Play Store

1. Create a keystore:
```bash
keytool -genkey -v -keystore android/app/upload-keystore.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias upload
```
2. Create `android/key.properties`:
```properties
storePassword=<your-password>
keyPassword=<your-password>
keyAlias=upload
storeFile=../app/upload-keystore.jks
```
3. Replace placeholder icons in `android/app/src/main/res/mipmap-*/`.
4. Set `applicationId = "com.yourname.knxcontrol"` in `android/app/build.gradle`.
5. Build:
```bash
flutter build appbundle --release
# Output: build/app/outputs/bundle/release/app-release.aab
```

### Versioning

Version is managed in `pubspec.yaml`:
```yaml
version: 1.0.0+1   # <semantic-version>+<build-number>
```
Increment `+1` for each store submission.
