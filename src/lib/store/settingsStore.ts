"use client";
// Agni-Kunda — dual-persistence BYOK settings: keys live in localStorage AND (when running locally) in .env.local.
import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { PROVIDER_ORDER, PROVIDERS, type ProviderId } from "@/lib/llm/providers";
import { createVault, unlockVault as decryptVault, lockVault, saveVaultProvider, settingsFromVault } from "@/lib/sync/keyVault";
import { hasDriveSession, restoreEncryptedVault, syncEncryptedVault } from "@/lib/sync/googleDriveVault";

export interface EnvProviderStatus {
  configured: boolean;
  source: string | null;
  masked: string | null;
  model: string | null;
  baseUrl?: string | null;
}
export interface EnvStatus {
  providers: Record<ProviderId, EnvProviderStatus>;
  defaultProvider: ProviderId | null;
  writable: boolean;
  reason?: string;
  file: string;
  neo4j: { configured: boolean; uri: string | null };
}

export interface SaveResult {
  browser: boolean;
  env: "written" | "skipped" | "failed";
  message: string;
}

interface SettingsState {
  active: ProviderId | null;
  keys: Partial<Record<ProviderId, string>>;
  models: Partial<Record<ProviderId, string>>;
  ollamaBaseUrl: string;
  semantic: boolean;
  env: EnvStatus | null;
  envLoaded: boolean;
  vaultEnabled: boolean;
  vaultUnlocked: boolean;

  loadEnv: () => Promise<void>;
  setActive: (p: ProviderId | null) => void;
  setModel: (p: ProviderId, model: string) => void;
  setSemantic: (on: boolean) => void;
  saveProvider: (p: ProviderId, input: { key?: string; model?: string; baseUrl?: string; makeDefault?: boolean }) => Promise<SaveResult>;
  forgetKey: (p: ProviderId) => Promise<void>;
  enableSecureVault: (passphrase: string) => Promise<void>;
  unlockSecureVault: (passphrase: string) => Promise<void>;
  restoreSecureVault: (passphrase: string) => Promise<void>;
  syncSecureVault: () => Promise<void>;
  lockSecureVault: () => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      active: null,
      keys: {},
      models: {},
      ollamaBaseUrl: "http://localhost:11434",
      semantic: true,
      env: null,
      envLoaded: false,
      vaultEnabled: false,
      vaultUnlocked: false,

      loadEnv: async () => {
        try {
          const res = await fetch("/api/settings/env", { cache: "no-store" });
          if (!res.ok) throw new Error(String(res.status));
          const env = (await res.json()) as EnvStatus;
          set({ env, envLoaded: true });
          // Auto-connect: if nothing chosen yet, adopt the .env default or the first configured provider.
          if (!get().active) {
            const usable = (p: ProviderId | null) => !!p && (p === "ollama" || env.providers[p]?.configured || !!get().keys[p]);
            const def = usable(env.defaultProvider) ? env.defaultProvider : null;
            const first = def || PROVIDER_ORDER.find((p) => p !== "ollama" && env.providers[p]?.configured) || PROVIDER_ORDER.find((p) => get().keys[p]) || null;
            if (first) set({ active: first });
          }
          if (env.providers.ollama?.baseUrl && get().ollamaBaseUrl === "http://localhost:11434") set({ ollamaBaseUrl: env.providers.ollama.baseUrl });
        } catch {
          set({ envLoaded: true });
        }
      },

      setActive: (active) => set({ active }),
      setModel: (p, model) => set({ models: { ...get().models, [p]: model } }),
      setSemantic: (semantic) => set({ semantic }),

      saveProvider: async (p, input) => {
        if (get().vaultEnabled && !get().vaultUnlocked)
          return { browser: false, env: "skipped", message: "Unlock your secure vault in Settings → Secure sync before saving credentials." };
        const keys = { ...get().keys };
        const models = { ...get().models };
        if (input.key !== undefined) {
          if (input.key.trim()) keys[p] = input.key.trim();
          else delete keys[p];
        }
        if (input.model) models[p] = input.model;

        if (get().vaultEnabled) {
          try {
            await saveVaultProvider(p, keys[p] || "", models[p]);
          } catch (e) {
            return { browser: false, env: "failed", message: "Could not encrypt changes: " + (e as Error).message };
          }
          set({ keys, models, ...(input.makeDefault ? { active: p } : {}) });
          let synced = false;
          if (hasDriveSession()) {
            try {
              const merged = await syncEncryptedVault();
              const state = settingsFromVault(merged);
              set({ keys: state.keys, models: { ...models, ...state.models } });
              synced = true;
            } catch {
              // The encrypted local copy remains safe; manual Sync can retry.
            }
          }
          return { browser: true, env: "skipped", message: synced
            ? "Encrypted locally and synced to your private Google Drive vault."
            : "Encrypted on this device. Connect Google Drive and tap Sync to update other devices." };
        }

        set({ keys, models, ...(p === "ollama" && input.baseUrl ? { ollamaBaseUrl: input.baseUrl } : {}), ...(input.makeDefault ? { active: p } : {}) });
        try {
          const res = await fetch("/api/settings/env", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider: p, apiKey: input.key, model: input.model, baseUrl: input.baseUrl, makeDefault: input.makeDefault }),
          });
          const j = (await res.json().catch(() => ({}))) as { written?: boolean; reason?: string; file?: string };
          await get().loadEnv();
          if (res.ok && j.written) return { browser: true, env: "written", message: "Saved in this browser and written to " + (j.file || ".env.local") + "." };
          return { browser: true, env: "skipped", message: "Saved in this browser. " + (j.reason || "Server-side .env write is disabled here.") };
        } catch {
          return { browser: true, env: "failed", message: "Saved in this browser. Could not reach the settings API to update .env.local." };
        }
      },

      forgetKey: async (p) => {
        if (get().vaultEnabled && !get().vaultUnlocked) throw new Error("Unlock the secure vault first.");
        if (get().vaultEnabled) await saveVaultProvider(p, "", get().models[p]);
        const keys = { ...get().keys };
        delete keys[p];
        set({ keys });
        if (get().vaultEnabled) {
          if (hasDriveSession()) {
            try {
              const merged = await syncEncryptedVault();
              set({ keys: settingsFromVault(merged).keys });
            } catch {}
          }
          return;
        }
        await fetch("/api/settings/env", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: p }) }).catch(() => {});
        await get().loadEnv();
      },

      enableSecureVault: async (secret) => {
        await createVault(secret, get().keys, get().models);
        // Persisted keys are scrubbed by partialize once vaultEnabled flips.
        set({ vaultEnabled: true, vaultUnlocked: true });
      },
      unlockSecureVault: async (secret) => {
        const data = await decryptVault(secret);
        const state = settingsFromVault(data);
        set({ keys: state.keys, models: { ...get().models, ...state.models }, vaultEnabled: true, vaultUnlocked: true });
      },
      restoreSecureVault: async (secret) => {
        if (Object.keys(get().keys).length) throw new Error("This browser has existing keys. Create a local secure vault first, then sync to merge them.");
        const data = await restoreEncryptedVault(secret);
        const state = settingsFromVault(data);
        set({ keys: state.keys, models: { ...get().models, ...state.models }, vaultEnabled: true, vaultUnlocked: true });
      },
      syncSecureVault: async () => {
        if (!get().vaultUnlocked) throw new Error("Unlock the encrypted vault first.");
        const data = await syncEncryptedVault();
        const state = settingsFromVault(data);
        set({ keys: state.keys, models: { ...get().models, ...state.models } });
      },
      lockSecureVault: () => {
        lockVault();
        set({ keys: {}, vaultUnlocked: false });
      },
    }),
    {
      name: "gitaviswa:agni-kunda",
      partialize: (s) => ({ active: s.active, ...(s.vaultEnabled ? {} : { keys: s.keys }), models: s.models, ollamaBaseUrl: s.ollamaBaseUrl, semantic: s.semantic, vaultEnabled: s.vaultEnabled }),
    },
  ),
);

export type Connection = { provider: ProviderId; via: "browser" | "env" | "local"; model: string } | null;

/** The provider Partha-Sarathi will actually use right now (null → offline graph-composed answers). */
export function currentConnection(s: Pick<SettingsState, "active" | "keys" | "models" | "env">): Connection {
  const p = s.active;
  if (!p) return null;
  const model = s.models[p] || s.env?.providers[p]?.model || PROVIDERS[p].defaultModel;
  if (p === "ollama") return { provider: p, via: "local", model };
  if (s.keys[p]) return { provider: p, via: "browser", model };
  if (s.env?.providers[p]?.configured) return { provider: p, via: "env", model };
  return null;
}

/**
 * React hook for the active connection. Selects only stable store references and derives the object with
 * useMemo — a selector that builds a fresh object (`useSettings((s) => currentConnection(s))`) makes
 * zustand's useSyncExternalStore snapshot unstable and loops forever.
 */
export function useConnection(): Connection {
  const active = useSettings((s) => s.active);
  const keys = useSettings((s) => s.keys);
  const models = useSettings((s) => s.models);
  const env = useSettings((s) => s.env);
  return useMemo(() => currentConnection({ active, keys, models, env }), [active, keys, models, env]);
}
