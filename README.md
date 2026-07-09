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

## Notes on this MVP

- Conversation state is in-memory (`src/session.js`), keyed by Twilio's
  `CallSid`. Fine for a single server process; use Redis or similar if
  you scale to multiple instances.
- Voice quality uses Twilio's built-in Polly voices — good enough for an
  MVP with zero extra accounts. For a more natural voice, swap in a
  streaming TTS provider (ElevenLabs, Cartesia) — see `docs/strategy.md`
  for the fuller architecture with dedicated STT/TTS providers and
  lower latency via Twilio Media Streams.
- No calendar integration yet — bookings are captured as leads for a
  human to confirm. Add a Calendly/Google Calendar API call in
  `src/leads.js` (or a new `capture_lead` handler) when you're ready.
