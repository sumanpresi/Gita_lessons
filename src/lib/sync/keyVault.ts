import type { ProviderId } from "@/lib/llm/providers";

/** Client-only encrypted vault. Passphrase and unwrapped keys are never persisted. */
export const LOCAL_VAULT_KEY = "gitaviswa:encrypted-api-vault:v1";
const ITERATIONS = 310000;
export type VaultItem = { key: string; model?: string; updatedAt: number };
export type VaultData = { version: 1; providers: Partial<Record<ProviderId, VaultItem>> };
export type SealedVault = {
  version: 1; iterations: number; salt: string; iv: string; ciphertext: string; updatedAt: number;
};

let passphrase: string | null = null;
let current: VaultData | null = null;

const encode = (bytes: Uint8Array): string => {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
};
const decode = (s: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function localVault(): SealedVault | null {
  if (typeof window === "undefined") return null;
  const text = localStorage.getItem(LOCAL_VAULT_KEY);
  if (!text) return null;
  const data = JSON.parse(text) as SealedVault;
  if (data.version !== 1 || data.iterations !== ITERATIONS || !data.salt || !data.iv || !data.ciphertext) {
    throw new Error("Unknown encrypted vault format. Nothing was overwritten.");
  }
  return data;
}

async function derivedKey(secret: string, salt: Uint8Array<ArrayBuffer>) {
  const input = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS },
    input,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function seal(data: VaultData, secret: string, existing?: SealedVault | null): Promise<SealedVault> {
  const salt = existing ? decode(existing.salt) : crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await derivedKey(secret, salt);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(data)));
  return { version: 1, iterations: ITERATIONS, salt: encode(salt), iv: encode(iv), ciphertext: encode(new Uint8Array(encrypted)), updatedAt: Date.now() };
}

async function open(packet: SealedVault, secret: string): Promise<VaultData> {
  if (packet.version !== 1 || packet.iterations !== ITERATIONS) throw new Error("Unsupported encrypted vault version.");
  try {
    const key = await derivedKey(secret, decode(packet.salt));
    const bytes = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(packet.iv) }, key, decode(packet.ciphertext));
    const data = JSON.parse(new TextDecoder().decode(bytes)) as VaultData;
    if (data.version !== 1 || !data.providers || typeof data.providers !== "object") throw new Error("Bad vault structure");
    return data;
  } catch {
    throw new Error("Unable to unlock the vault. Check your passphrase and Google account.");
  }
}

const savePacket = (packet: SealedVault) => localStorage.setItem(LOCAL_VAULT_KEY, JSON.stringify(packet));
export function vaultUnlocked(): boolean { return !!passphrase && !!current; }
export function lockVault() { passphrase = null; current = null; }
export function vaultSnapshot(): VaultData {
  if (!current) throw new Error("Unlock the encrypted vault first.");
  return structuredClone(current);
}

export async function createVault(secret: string, keys: Partial<Record<ProviderId, string>>, models: Partial<Record<ProviderId, string>>): Promise<VaultData> {
  if (secret.length < 12) throw new Error("Choose a vault passphrase of at least 12 characters.");
  if (localVault()) throw new Error("An encrypted vault already exists. Unlock it instead.");
  const providers: VaultData["providers"] = {};
  for (const id of Object.keys(keys) as ProviderId[]) {
    if (keys[id]) providers[id] = { key: keys[id]!, model: models[id], updatedAt: Date.now() };
  }
  const data: VaultData = { version: 1, providers };
  const encrypted = await seal(data, secret);
  savePacket(encrypted); // never delete the original persisted settings before the encrypted save succeeds
  passphrase = secret;
  current = data;
  return vaultSnapshot();
}

export async function unlockVault(secret: string): Promise<VaultData> {
  const packet = localVault();
  if (!packet) throw new Error("No encrypted vault exists on this device.");
  const data = await open(packet, secret);
  passphrase = secret;
  current = data;
  return vaultSnapshot();
}

export async function restoreVault(packet: SealedVault, secret: string): Promise<VaultData> {
  if (localVault()) throw new Error("This device already has a vault. Unlock it and use Sync instead.");
  const data = await open(packet, secret); // validate passphrase BEFORE writing
  savePacket(packet);
  passphrase = secret;
  current = data;
  return vaultSnapshot();
}

export async function saveVaultProvider(id: ProviderId, key: string, model?: string) {
  if (!current || !passphrase) throw new Error("Unlock your vault before changing API credentials.");
  const next = structuredClone(current);
  // Empty key is a tombstone, so a subsequent sync does not resurrect the old credential.
  next.providers[id] = { key, model, updatedAt: Date.now() };
  const sealed = await seal(next, passphrase, localVault());
  savePacket(sealed);
  current = next;
}

export async function mergeVault(remotePacket: SealedVault): Promise<{ data: VaultData; upload: boolean }> {
  if (!current || !passphrase) throw new Error("Unlock your vault before syncing.");
  const remote = await open(remotePacket, passphrase);
  const combined = structuredClone(current);
  for (const [id, item] of Object.entries(remote.providers) as [ProviderId, VaultItem][]) {
    const localItem = combined.providers[id];
    if (!localItem || item.updatedAt >= localItem.updatedAt) combined.providers[id] = item;
  }
  const upload = JSON.stringify(combined.providers) !== JSON.stringify(remote.providers);
  const save = await seal(combined, passphrase, remotePacket);
  savePacket(save);
  current = combined;
  return { data: vaultSnapshot(), upload };
}

export function sealedVault(): SealedVault {
  const packet = localVault();
  if (!packet || !vaultUnlocked()) throw new Error("Unlock your encrypted vault first.");
  return packet;
}

export function settingsFromVault(data: VaultData) {
  const keys: Partial<Record<ProviderId, string>> = {};
  const models: Partial<Record<ProviderId, string>> = {};
  for (const [id, item] of Object.entries(data.providers) as [ProviderId, VaultItem][]) {
    if (item.key) keys[id] = item.key;
    if (item.model) models[id] = item.model;
  }
  return { keys, models };
}
