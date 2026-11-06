import { test } from "node:test";
import assert from "node:assert/strict";
import { PROVIDERS, PROVIDER_ORDER, MANAGED_ENV_KEYS } from "../src/lib/llm/providers.ts";

test("Gemini provider is selectable and configured for the compatible endpoint", () => {
  assert.ok(PROVIDER_ORDER.includes("gemini"));
  assert.equal(PROVIDERS.gemini.envKey, "GEMINI_API_KEY");
  assert.equal(PROVIDERS.gemini.envModel, "GEMINI_MODEL");
  assert.equal(PROVIDERS.gemini.baseUrl, "https://generativelanguage.googleapis.com/v1beta/openai");
  assert.equal(PROVIDERS.gemini.defaultModel, "gemini-3.8-flash");
  assert.ok(MANAGED_ENV_KEYS.includes("GEMINI_API_KEY"));
});

test("OpenAI GPT-5.6 Luna is available as a default model", () => {
  assert.equal(PROVIDERS.openai.defaultModel, "gpt-5.6-luna");
  assert.ok(PROVIDERS.openai.models.some((m) => m.id === "gpt-5.6-luna"));
});
