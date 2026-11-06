# Set up OpenAI and Google Gemini for Gita Lessons

Open https://gita-lessons-steel.vercel.app and select **Settings → AI (optional)**.

1. Select **OpenAI** or **Google Gemini**.
2. Enter a private API key from https://platform.openai.com/api-keys or https://aistudio.google.com/api-keys.
3. Choose a model, press **Test connection**, then **Save and use**.
4. Switch providers at any time. Select **No model** to use the offline knowledge graph.

Built-in model choices:
- OpenAI: `gpt-5.6-luna` (default), `gpt-5.6-terra`, `gpt-5.6-sol`, and legacy GPT-4o models.
- Gemini: `gemini-3.8-flash` (default), `gemini-3.7-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-pro-preview`.

## Private keys and public deployment

In the deployed site, **Save and use** stores your key in that browser's local storage, not GitHub. Use a trusted device and avoid shared browser profiles. The key goes to the website's server when you make an AI request and is then forwarded to the selected provider.

Vercel environment variable names, for an optional separately secured server configuration:

| Variable | Example |
| --- | --- |
| `OPENAI_API_KEY` | private key |
| `OPENAI_MODEL` | `gpt-5.6-luna` |
| `GEMINI_API_KEY` | private key |
| `GEMINI_MODEL` | `gemini-3.8-flash` |
| `LLM_PROVIDER` | `openai` or `gemini` |

**Important:** This site deliberately does not use server-owned API keys for anonymous visitors. Do not set `GITAVISWA_SHARE_SERVER_KEYS=true` on a public website. To offer a shared paid AI service, first add authentication, rate limits, abuse prevention, and spending controls. Vercel environment variable changes require redeployment.

API availability and pricing depend on each provider's account. A ChatGPT subscription does not provide OpenAI API credit.

References:
- https://developers.openai.com/api/docs/models/gpt-5.6-luna
- https://ai.google.dev/gemini-api/docs/openai
- https://ai.google.dev/gemini-api/docs/models
