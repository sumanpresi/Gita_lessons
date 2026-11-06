# Gita Lessons: Android install and encrypted API-key sync

## Install on Samsung Z Fold 8

1. In **Google Chrome** on the Z Fold, open https://gita-lessons-steel.vercel.app.
2. Tap the Chrome three-dot menu and select **Install app** (or **Add to Home screen** → Install).
3. Open **Gita Lessons** from the home screen or app drawer. It opens as a standalone PWA.
4. The app can use its previously loaded text, graph and shell offline; AI requests and Google Drive sync still need internet.

This is an installable web app, not an APK from the Play Store. The same site works on the Fold cover screen, inner screen, desktop and other modern browsers.

## Set up Google Drive private sync

An existing Google OAuth web client ID from the user's Quick Capture project is supplied to Vercel through `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (public ID only, never the client secret).

**One-time Google Cloud setup still required by the project owner:**
1. Visit https://console.cloud.google.com/apis/credentials and select the Google Cloud project that owns that OAuth web client.
2. Open the **OAuth 2.0 Client ID** used by Quick Capture.
3. Under **Authorized JavaScript origins**, add exactly:
   `https://gita-lessons-steel.vercel.app`
4. Ensure Google Drive API is enabled for the project in https://console.cloud.google.com/apis/library/drive.googleapis.com.
5. If the OAuth consent screen is in Testing, verify the account you use on PC and Z Fold is listed as a **test user**.
6. Save. Google Drive private sync requests only `https://www.googleapis.com/auth/drive.appdata`.

The web client ID is intentionally public. **Never put a Google client secret or an LLM API key into NEXT_PUBLIC_ environment variables, GitHub source, or screenshots.**

## First device: create and upload vault

1. Open **Settings → Secure sync** in the web app.
2. Set a strong memorable vault passphrase (at least 12 characters) and create the vault. Existing API keys are migrated into encrypted local storage.
3. Tap **Connect Google Drive** and select your Google account.
4. Tap **Sync now**. Only AES-256-GCM ciphertext is uploaded to Google's hidden app-data folder.

## Second device: restore

1. Install or open the same app URL.
2. Open **Settings → Secure sync**.
3. Tap **Connect Google Drive** using the *same Google account*.
4. Enter the *same vault passphrase*, then tap **Restore from Drive**.
5. Your API keys become available in memory for this app session.

While a valid Google access token is held in browser memory, saving/removing a key automatically syncs changes to Drive. Tap **Sync now** on the other device to fetch changes. Reconnect Google when its access expires. This design does **not** implement unattended background sync across browser restarts.

## Security design

- Web Crypto PBKDF2-SHA-256 (310,000 iterations, random salt) derives an AES-256-GCM key from the passphrase.
- AES-GCM uses a new random nonce for every encrypted save.
- Local storage and Google Drive contain encrypted ciphertext only after the vault is enabled. Decrypted keys are kept in app memory only while unlocked.
- Passphrase is not transmitted to Google or Vercel, and cannot be recovered. Keep your own secure backup of it.
- Google access token is kept only in memory. The user must reconnect when the session expires.
- The current app forwards the API key to its own Next.js endpoint when making an AI request and onward to the chosen AI provider. Do not use on a compromised device or untrusted browser.
- Cloud sync uses per-provider last-write-wins timestamps; simultaneous edits on different devices may need a manual re-sync. For a fully automatic multi-device service, add an authenticated backend with conflict control.

Do not enable `GITAVISWA_SHARE_SERVER_KEYS` on this public website.
