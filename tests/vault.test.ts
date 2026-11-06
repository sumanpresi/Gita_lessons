import { test } from "node:test";
import assert from "node:assert/strict";
import { createVault, unlockVault, lockVault, saveVaultProvider, localVault, settingsFromVault, LOCAL_VAULT_KEY } from "../src/lib/sync/keyVault.ts";

test("encrypted vault never persists raw API credentials", async () => {
  const memory = new Map<string, string>();
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => memory.get(key) || null,
      setItem: (key: string, value: string) => { memory.set(key, value); },
    },
  });

  const passphrase = "a-long-private-passphrase-123";
  const fakeSecret = "sk-this-is-an-example-not-a-real-key";
  const created = await createVault(passphrase, { openai: fakeSecret }, { openai: "gpt-5.6-luna" });
  assert.equal(created.providers.openai?.key, fakeSecret);
  assert.ok(localVault()?.ciphertext);
  assert.ok(!memory.get(LOCAL_VAULT_KEY)?.includes(fakeSecret));

  lockVault();
  await assert.rejects(() => unlockVault("wrong-passphrase-000"));
  const unlocked = await unlockVault(passphrase);
  assert.equal(settingsFromVault(unlocked).keys.openai, fakeSecret);

  await saveVaultProvider("gemini", "gemini-example-key", "gemini-3.8-flash");
  lockVault();
  const again = await unlockVault(passphrase);
  assert.equal(settingsFromVault(again).keys.gemini, "gemini-example-key");
  assert.ok(!memory.get(LOCAL_VAULT_KEY)?.includes("gemini-example-key"));
  lockVault();
});
