# Android app + push notifications

The Android app is a Capacitor shell (`android/`, `capacitor.config.ts`) that
loads the live site, so every web deploy updates it. Only native changes
(icon, permissions, plugins) need a new APK. Push goes through Firebase Cloud
Messaging: each phone registers its token for the signed-in user
(`/api/push/register` → `users/{uid}/pushTokens`), and every non-routine alert
from `deliverNotification` also goes to the user's phones. Tapping one opens
the same page the bell would.

## One-time setup

1. **Live URL.** Copy the App Hosting URL (Firebase console → App Hosting →
   your backend, e.g. `https://command-center--<project>.us-east4.hosted.app`).
   GitHub repo → Settings → Secrets and variables → Actions → **Variables** →
   add `CAP_SERVER_URL` with that URL.

2. **Firebase Android app.** Firebase console → Project settings → General →
   Add app → Android. Package name: `com.aaromach.commandcenter`. Download
   `google-services.json`. In GitHub → Actions **Secrets**, add
   `GOOGLE_SERVICES_JSON` and paste the whole file contents.

3. **Signing key** (keep it forever; losing it means phones can't update):
   ```
   keytool -genkeypair -v -keystore aaromach-release.jks -keyalg RSA -keysize 2048 \
     -validity 10000 -alias aaromach
   base64 -w0 aaromach-release.jks   # macOS: base64 -i aaromach-release.jks
   ```
   Add Actions secrets: `ANDROID_KEYSTORE_BASE64` (the base64 output),
   `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`aaromach`),
   `ANDROID_KEY_PASSWORD`. Store the `.jks` and passwords somewhere safe
   (password manager). Never commit it.

4. **Deploy Firestore indexes** (adds the `pushTokens` index):
   `firebase deploy --only firestore:indexes`.

## Build and install

- GitHub → Actions → **Android APK** → Run workflow. When it finishes, download
  the `aaromach-android-release-N` artifact (a zip containing the APK).
- Send the APK to phones (text, email, Drive). On the phone: open it, allow
  "Install unknown apps" for that app when asked, install.
- First launch: sign in, then allow notifications when asked.
- New APKs (from later runs) install over the old one as long as the same
  keystore signs them.

## Test a push

Assign yourself (on the phone) a job from another admin account, or approve a
weekly log — the phone should buzz with the alert, and tapping it opens the job
or log. Routine activity (in-app-only alerts) stays in the bell and doesn't
push.

## Later

- Google Play: upload an App Bundle (`./gradlew bundleRelease`) to the Play
  Console ($25 one-time) for automatic updates.
- iPhone: `npx cap add ios`, build on a cloud Mac (Codemagic), Apple Developer
  account ($99/yr), and an APNs key uploaded to Firebase Cloud Messaging.
