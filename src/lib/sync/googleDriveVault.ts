"use client";
import { localVault, mergeVault, restoreVault, sealedVault, vaultSnapshot, type SealedVault, type VaultData } from "./keyVault";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const FILE_NAME = "gita-lessons-encrypted-api-vault-v1.json";
const ROOT = "https://www.googleapis.com/drive/v3";
let accessToken: string | null = null;
let tokenExpiry = 0;
let loadScript: Promise<void> | null = null;

interface GoogleTokenResult { access_token?: string; expires_in?: string | number; error?: string; error_description?: string }
interface GoogleClient {
  requestAccessToken: (options?: { prompt?: string }) => void;
}
interface GoogleOAuth {
  initTokenClient: (options: { client_id: string; scope: string; callback: (response: GoogleTokenResult) => void; error_callback?: (e: { type: string }) => void }) => GoogleClient;
}
declare global { interface Window { google?: { accounts?: { oauth2?: GoogleOAuth } } } }

export function isDriveConfigured() { return !!CLIENT_ID; }
export function hasDriveSession() { return !!accessToken && Date.now() + 60000 < tokenExpiry; }
export function disconnectDrive() { accessToken = null; tokenExpiry = 0; }

export function prepareGoogleSignIn(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (loadScript) return loadScript;
  loadScript = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { loadScript = null; reject(new Error("Could not load Google sign-in. Check your connection.")); };
    document.head.appendChild(script);
  });
  return loadScript;
}

/** OAuth access token stays in memory and is limited to Drive's hidden app-data folder. */
export async function connectDrive(): Promise<void> {
  if (!CLIENT_ID) throw new Error("Google sync needs NEXT_PUBLIC_GOOGLE_CLIENT_ID configured in Vercel.");
  await prepareGoogleSignIn();
  const oauth = window.google?.accounts?.oauth2;
  if (!oauth) throw new Error("Google sign-in is not available in this browser.");
  return new Promise((resolve, reject) => {
    const client = oauth.initTokenClient({
      client_id: CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: (res) => {
        if (!res.access_token) return reject(new Error(res.error_description || res.error || "Google sign-in was cancelled."));
        accessToken = res.access_token;
        tokenExpiry = Date.now() + Number(res.expires_in || 3600) * 1000;
        resolve();
      },
      error_callback: (e) => reject(new Error("Google sign-in failed: " + e.type)),
    });
    client.requestAccessToken({ prompt: "select_account" });
  });
}

async function driveRequest(url: string, options: RequestInit = {}): Promise<Response> {
  if (!hasDriveSession()) throw new Error("Google connection has expired. Connect Google Drive again.");
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${accessToken}`, ...(options.headers as Record<string,string> || {}) },
    cache: "no-store",
  });
  if (!response.ok) {
    const error = (await response.text().catch(() => "")).slice(0, 220);
    throw new Error(`Google Drive error ${response.status}: ${error}`);
  }
  return response;
}
async function findVaultFile(): Promise<string | null> {
  const params = new URLSearchParams({
    spaces: "appDataFolder",
    q: `name = '${FILE_NAME}' and trashed = false`,
    fields: "nextPageToken,files(id,name,modifiedTime)",
    pageSize: "20",
  });
  const response = await driveRequest(`${ROOT}/files?${params}`);
  const json = await response.json() as { files?: { id: string; modifiedTime?: string }[] };
  const files = [...(json.files || [])].sort((a,b)=>(b.modifiedTime || "").localeCompare(a.modifiedTime || ""));
  return files[0]?.id || null;
}
async function readPacket(id: string): Promise<SealedVault> {
  const response = await driveRequest(`${ROOT}/files/${encodeURIComponent(id)}?alt=media`);
  return await response.json() as SealedVault;
}
async function uploadPacket(fileId: string | null, packet: SealedVault): Promise<void> {
  if (fileId) {
    await driveRequest(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(packet),
    });
  } else {
    const boundary = "gita_vault_" + Math.random().toString(36).slice(2);
    const metadata = { name: FILE_NAME, mimeType: "application/json", parents: ["appDataFolder"] };
    const body = [
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
      JSON.stringify(metadata),
      `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n`,
      JSON.stringify(packet),
      `\r\n--${boundary}--`,
    ].join("");
    await driveRequest("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
      method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body,
    });
  }
}

let syncing: Promise<VaultData> | null = null;
export function syncEncryptedVault(): Promise<VaultData> {
  if (syncing) return syncing;
  syncing = (async () => {
    const packet = sealedVault();
    const id = await findVaultFile();
    if (id) {
      const { data, upload } = await mergeVault(await readPacket(id));
      if (upload) await uploadPacket(id, sealedVault());
      return data;
    }
    await uploadPacket(null, packet);
    return vaultSnapshot();
  })();
  return syncing.finally(() => { syncing = null; });
}

export async function restoreEncryptedVault(secret: string): Promise<VaultData> {
  if (localVault()) throw new Error("A local vault already exists. Unlock it and choose Sync instead.");
  const id = await findVaultFile();
  if (!id) throw new Error("No Gita Lessons vault was found in this Google account. Create one on your first device and sync it.");
  return restoreVault(await readPacket(id), secret);
}
