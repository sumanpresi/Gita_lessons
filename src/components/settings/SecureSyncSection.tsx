"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, Cloud, CloudOff, KeyRound, LockKeyhole, ShieldCheck, Smartphone, UnlockKeyhole } from "lucide-react";
import { useSettings } from "@/lib/store/settingsStore";
import { connectDrive, disconnectDrive, hasDriveSession, isDriveConfigured, prepareGoogleSignIn } from "@/lib/sync/googleDriveVault";

export function SecureSyncSection() {
  const enabled = useSettings((s) => s.vaultEnabled);
  const unlocked = useSettings((s) => s.vaultUnlocked);
  const keys = useSettings((s) => s.keys);
  const enable = useSettings((s) => s.enableSecureVault);
  const unlock = useSettings((s) => s.unlockSecureVault);
  const restore = useSettings((s) => s.restoreSecureVault);
  const sync = useSettings((s) => s.syncSecureVault);
  const lock = useSettings((s) => s.lockSecureVault);
  const [phrase, setPhrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [connected, setConnected] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const clientReady = isDriveConfigured();
  const keyCount = Object.values(keys).filter(Boolean).length;

  useEffect(() => {
    setConnected(hasDriveSession());
    if (clientReady) prepareGoogleSignIn().then(() => setGoogleReady(true)).catch(() => setGoogleReady(false));
  }, [clientReady]);

  async function run(task: () => Promise<void>, success: string) {
    setBusy(true);
    setMessage(null);
    try {
      await task();
      setMessage({ ok: true, text: success });
      setPhrase("");
      setConfirm("");
      setConnected(hasDriveSession());
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    if (phrase !== confirm) {
      setMessage({ ok: false, text: "The two passphrases must match." });
      return;
    }
    await run(async () => {
      await enable(phrase);
      if (hasDriveSession()) await sync();
    }, hasDriveSession() ? "Your API keys are encrypted and synced to Google Drive." : "Your API keys are encrypted on this device. Connect Google Drive to sync them.");
  }

  const classes = "field w-full font-mono !text-[13px]";
  return (
    <section className="space-y-5" aria-label="Secure API key sync">
      <div>
        <div className="flex items-center gap-2">
          <ShieldCheck size={20} className="text-accent-text" />
          <h2 className="text-[19px] font-semibold text-text">Secure sync</h2>
        </div>
        <p className="mt-1 text-[13px] leading-5 text-text-2">
          Keep your OpenAI, Gemini and other API keys available on your Z Fold and computer.
          Keys are encrypted with your passphrase before they are saved locally or sent to Google Drive&apos;s private app-data folder.
        </p>
      </div>

      <div className="rounded-3 border border-line bg-surface-2 p-4">
        <div className="flex items-start gap-3">
          {enabled ? unlocked ? <UnlockKeyhole size={19} className="text-good" /> : <LockKeyhole size={19} className="text-accent-text" /> : <KeyRound size={19} className="text-text-2" />}
          <div className="flex-1">
            <p className="text-[14px] font-medium text-text">
              {enabled ? unlocked ? "Vault unlocked on this device" : "Encrypted vault is locked" : "Create your encrypted vault"}
            </p>
            <p className="mt-1 text-[12.5px] leading-5 text-text-3">
              {enabled ? unlocked ? `${keyCount} API provider key(s) are available for this session.` : "Unlock after opening the app to use your saved API keys." : "Existing saved API keys will be moved into encrypted storage."}
            </p>
          </div>
        </div>

        {!unlocked && (
          <div className="mt-4 space-y-3">
            <label className="block text-[12px] font-medium text-text-2" htmlFor="vault-passphrase">Vault passphrase</label>
            <input id="vault-passphrase" className={classes} type="password" value={phrase} minLength={12}
              onChange={(e) => setPhrase(e.target.value)} autoComplete="off" spellCheck={false}
              placeholder={enabled ? "Enter your vault passphrase" : "At least 12 characters"} />
            {!enabled && (
              <>
                <label className="block text-[12px] font-medium text-text-2" htmlFor="vault-confirm">Confirm passphrase</label>
                <input id="vault-confirm" className={classes} type="password" value={confirm}
                  onChange={(e) => setConfirm(e.target.value)} autoComplete="off" spellCheck={false} placeholder="Repeat the same passphrase" />
              </>
            )}
            <div className="flex flex-wrap gap-2">
              {enabled ? (
                <button className="btn btn-primary" disabled={busy || !phrase} onClick={() => run(() => unlock(phrase), "Vault unlocked. Your API keys are ready on this device.")}>
                  <UnlockKeyhole size={14}/> Unlock
                </button>
              ) : (
                <button className="btn btn-primary" disabled={busy || phrase.length < 12 || !confirm} onClick={create}>
                  <LockKeyhole size={14}/> Create secure vault
                </button>
              )}
              {!enabled && connected && keyCount === 0 && (
                <button className="btn" disabled={busy || !phrase} onClick={() => run(() => restore(phrase), "Encrypted vault restored from Google Drive. API keys are ready.")}>
                  <Cloud size={14}/> Restore from Drive
                </button>
              )}
            </div>
          </div>
        )}
        {unlocked && (
          <button className="btn mt-3" disabled={busy} onClick={() => { lock(); setMessage({ ok: true, text: "Vault locked. The unwrapped API keys were cleared from app memory." }); }}>
            <LockKeyhole size={14}/> Lock vault
          </button>
        )}
      </div>

      <div className="rounded-3 border border-line p-4">
        <div className="flex items-start gap-3">
          {connected ? <Cloud size={19} className="text-good" /> : <CloudOff size={19} className="text-text-3" />}
          <div className="flex-1">
            <p className="text-[14px] font-medium text-text">Google Drive private sync</p>
            <p className="mt-1 text-[12.5px] leading-5 text-text-3">
              {connected ? "Connected for this browser session. After changes, keys sync automatically while the connection remains active." : "Connect the same Google account on each device. Only encrypted data is uploaded."}
            </p>
          </div>
        </div>
        {!clientReady && (
          <p className="mt-3 text-[12.5px] leading-5 text-danger">
            Google OAuth setup is required. Configure NEXT_PUBLIC_GOOGLE_CLIENT_ID and authorise this website&apos;s origin in Google Cloud.
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {!connected ? (
            <button className="btn btn-primary" disabled={!clientReady || !googleReady || busy} onClick={() => run(async () => {
              await connectDrive();
              if (unlocked) await sync();
            }, unlocked ? "Connected and synced with Google Drive." : "Connected. Unlock your vault or restore it below.")}>
              <Cloud size={14}/> {clientReady && !googleReady ? "Loading Google sign-in…" : "Connect Google Drive"}
            </button>
          ) : (
            <>
              <button className="btn btn-primary" disabled={busy || !unlocked} onClick={() => run(sync, "Encrypted keys synced with Google Drive.")}>
                <Cloud size={14}/> Sync now
              </button>
              <button className="btn" disabled={busy} onClick={() => { disconnectDrive(); setConnected(false); setMessage({ ok: true, text: "Google Drive disconnected for this session." }); }}>
                Disconnect
              </button>
            </>
          )}
        </div>
      </div>

      <div className="rounded-3 border border-line bg-surface-2 p-4 text-[12.5px] leading-5 text-text-2">
        <div className="mb-2 flex items-center gap-2 font-semibold text-text"><Smartphone size={16}/> Z Fold 8 setup</div>
        Open this website in Chrome, tap the three-dot menu, then <strong>Install app</strong>. In the installed app, open Settings → Secure sync, connect Google Drive, and restore with the same passphrase.
        <div className="mt-2 flex gap-2 text-text-3"><CheckCircle2 size={15} className="shrink-0 text-good"/> Your passphrase cannot be recovered. Do not use this vault on an untrusted or shared device.</div>
      </div>
      {message && <p className={`text-[12.5px] leading-5 ${message.ok ? "text-good" : "text-danger"}`} role="status">{message.text}</p>}
      <p className="text-[11.5px] leading-5 text-text-3">
        Google sign-in is required again when its temporary access expires. Sync occurs only while connected and online. Your passphrase and raw keys are never uploaded to Google Drive.
      </p>
    </section>
  );
}
