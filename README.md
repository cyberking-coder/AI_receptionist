# AI Receptionist

An AI voice agent that answers inbound business phone calls, responds to
caller questions using the business's own knowledge base, books
appointments, captures leads, and escalates to a human when needed.

See [docs/strategy.md](docs/strategy.md) for the build architecture and
go-to-market/sales strategy.

## How it works

Twilio answers the phone and handles speech-to-text and text-to-speech
(via `<Gather input="speech">` / `<Say>`). Each time the caller speaks,
their transcribed text is sent to an LLM (Groq by default, swappable),
which is forced via tool calling to return a structured decision every
turn: what to say next, and whether to keep listening, transfer to a
human, capture a lead (name/phone/reason), or end the call. The model
answers strictly from `knowledge-base/business.md` — it's instructed not
to invent hours, prices, or policies.

```
caller speech --Twilio STT--> text --> LLM (+ knowledge base, tool call)
                                          |
                                          v
                        { speech, action, lead? }
                                          |
                    continue / transfer / capture_lead / end_call
                                          |
                                          v
                        Twilio TTS speaks `speech` back
```

## Cost: this runs free

- **LLM**: defaults to **Groq**, which has a genuinely free API tier — get
  a key at [console.groq.com/keys](https://console.groq.com/keys) (no card,
  no install). The provider is swappable via `LLM_PROVIDER`: `groq`
  (default), `anthropic` (Claude), `ollama` (100% local, no key), or
  `openai`.
- **Phone**: Twilio is **pay-as-you-go with a free trial** (~$15 credit +
  a free trial number) — enough to make real test calls. You don't need
  it at all to try the agent: `npm run chat` runs the full brain in your
  terminal for free.

## Setup

1. **Install dependencies**
   ```
   npm install
   ```

2. **Configure environment**
   ```
   cp .env.example .env
   ```
   Set `LLM_PROVIDER` (default `groq`) and paste the matching free key —
   e.g. `GROQ_API_KEY`. Twilio credentials are only needed later for real
   phone calls.

3. **Customize the knowledge base**

   Edit `knowledge-base/business.md` with your real business name, hours,
   services, pricing, and policies. This file is the agent's entire
   source of truth — it will not answer questions beyond what's written
   here.

4. **Test the agent's brain without a phone call**
   ```
   npm run chat
   ```
   Talk to it in the terminal like a caller. Good for iterating on the
   knowledge base and prompt quickly.

5. **Run the server**
   ```
   npm start
   ```
   Starts on `PORT` (default 3000) with webhooks at `/voice` and
   `/handle-speech`.

6. **Expose it and connect a Twilio number**
   - For local testing, tunnel it: `ngrok http 3000`
   - In the [Twilio console](https://console.twilio.com), buy/select a
     phone number → under "Voice Configuration", set **"A call comes
     in"** to a webhook pointing at `https://<your-domain>/voice`
     (POST).
   - Optionally set the number's **status callback URL** to
     `https://<your-domain>/call-status` so sessions clean up promptly
     when calls end.
   - Call the number.

## Leads

When the agent captures a booking/callback request, it's appended as a
JSON line to `logs/leads.jsonl` (name, phone, reason, call SID, caller
number, timestamp). For production, replace `src/leads.js` with a call
to your CRM or a notification (email/Slack) instead of a local file.

## Natural voice (ElevenLabs)

By default the agent speaks with Twilio's built-in Polly voice (zero extra
setup). For a far more natural voice, use ElevenLabs (free tier):

1. Get a key at [elevenlabs.io](https://elevenlabs.io) → Profile → API Keys.
2. In `.env` set `TTS_PROVIDER=elevenlabs`, `ELEVENLABS_API_KEY=...`, and
   `PUBLIC_BASE_URL` to this server's public URL (your ngrok https URL).
3. Optionally pick a different `ELEVENLABS_VOICE_ID`.

How it works: each spoken line is synthesized to an MP3, cached under
`public/audio/`, and served so Twilio can `<Play>` it. Repeated lines
(like the greeting) are cached by content hash to save credits, and if
ElevenLabs is unreachable the agent automatically falls back to Twilio's
voice so a call never fails on TTS.

## Appointment booking

When a caller asks for an appointment, the agent collects their name,
phone, and preferred time, then books it:

- **Out of the box (no setup):** the request is recorded to
  `logs/bookings.jsonl` for a human to confirm.
- **With Cal.com (recommended):** set `CALCOM_API_KEY` and
  `CALCOM_EVENT_TYPE_ID` — simple API key, no Google Cloud. See
  [CALCOM_SETUP.md](CALCOM_SETUP.md). Verify with `npm run test:calcom`.
- **With Google Calendar (alternative):** set `GOOGLE_SERVICE_ACCOUNT_JSON`
  and `GOOGLE_CALENDAR_ID`, then share the calendar with the service
  account's email. See [GOOGLE_CALENDAR_SETUP.md](GOOGLE_CALENDAR_SETUP.md).
  (Note: some Google orgs block service-account keys — if so, use Cal.com.)

With either provider the agent **checks availability** before booking:

- If the requested slot is free, it books it and confirms.
- If it's taken, it offers the next open slots ("that's booked — I have
  3:30 or 4:30, would either work?") and books whichever the caller picks.

`APPOINTMENT_TIMEZONE`, `APPOINTMENT_DURATION_MIN`, and
`SUGGEST_WINDOW_HOURS` control the zone, slot length, and how far ahead it
looks for alternatives. If a provider call fails, it falls back to logging.

The agent is told today's date so it can resolve "tomorrow at 3pm" into a
concrete ISO time, and it respects the business hours in your knowledge
base.

## SMS confirmation

After a booking, the caller gets a text confirmation (via Twilio) — "Your
appointment is confirmed for Friday, July 10 at 3:00 PM." It's sent to the
number the caller provided, or their caller ID as a fallback. This reuses
your Twilio credentials; no extra setup. If Twilio isn't configured, the
call flow continues normally and the SMS is simply skipped.

> On a Twilio **trial** account you can only text numbers you've verified
> in the console — upgrade to text arbitrary callers.

## Notes on this MVP

- Conversation state is in-memory (`src/session.js`), keyed by Twilio's
  `CallSid`. Fine for a single server process; use Redis or similar if
  you scale to multiple instances.
- Booking here confirms the caller's requested time without real-time
  double-booking checks. For a production system, add an availability
  lookup (Calendar free/busy or Cal.com) before confirming.
