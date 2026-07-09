# Deploy to a stable public URL (Render)

For a real phone line you want an always-on server with a URL that doesn't
change. This repo includes a `render.yaml` blueprint for [Render](https://render.com),
which has a free tier and deploys straight from GitHub.

## Steps

1. Push this repo to your GitHub (already done if you're reading this on
   GitHub).
2. Create a free account at https://render.com and connect your GitHub.
3. **New + → Blueprint**, pick this repo. Render reads `render.yaml` and
   creates the web service.
4. It will prompt you for the secret env vars (marked `sync: false`):
   - `GROQ_API_KEY`
   - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
   - (optional) `ELEVENLABS_API_KEY`, Google Calendar vars
   Also set `BUSINESS_NAME` to your business.
5. Deploy. When it's live you'll get a stable URL like
   `https://ai-receptionist-xxxx.onrender.com`.
6. In the Twilio Console → your number → **Voice Configuration → "A call
   comes in"** → Webhook, URL =
   `https://ai-receptionist-xxxx.onrender.com/voice`, HTTP **POST**. Save.
7. Call your Twilio number.

That URL never changes, so you set the Twilio webhook once. ElevenLabs
audio works automatically here — Render exposes its own URL to the app.

## Important: free-tier cold starts

Render's **free** web service spins down after ~15 minutes of inactivity
and takes ~30–60s to wake on the next request. On a phone call that delay
means the **first** caller after idle may hit dead air or a timeout.

For testing this is usually fine (call once to wake it, then it's warm).
For a **production** receptionist, either:

- Upgrade to Render's paid instance (~$7/mo) so it never sleeps, **or**
- Keep it warm by pinging `/health` every ~10 minutes (e.g. a free cron
  service like cron-job.org hitting
  `https://ai-receptionist-xxxx.onrender.com/health`).

## Other hosts

The app is a plain Node/Express server (`npm start`, respects `PORT`), so
it runs anywhere — Railway, Fly.io, a VPS, etc. Only Render gets the
zero-config `render.yaml` and automatic ElevenLabs URL; elsewhere set
`PUBLIC_BASE_URL` to your public URL if you use ElevenLabs.
