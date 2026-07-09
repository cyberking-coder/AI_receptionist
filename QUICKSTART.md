# Quickstart: connect your Twilio trial number

Goal: call your Twilio trial number and have the AI receptionist answer.

## 1. Get the code running on your computer

```bash
git clone <your-repo-url>
cd AI_receptionist
npm install
```

## 2. Get a free Groq key (the agent's brain)

Sign up at https://console.groq.com/keys and copy an API key.

## 3. Create your .env

```bash
cp .env.example .env
```

Fill in at minimum:

```
LLM_PROVIDER=groq
GROQ_API_KEY=gsk_...            # from step 2

TWILIO_ACCOUNT_SID=AC...        # Twilio Console dashboard
TWILIO_AUTH_TOKEN=...           # Twilio Console dashboard
TWILIO_PHONE_NUMBER=+1...       # your trial number, E.164 format

BUSINESS_NAME=Your Business
```

Leave ElevenLabs and Google Calendar blank for now — the agent uses
Twilio's built-in voice and logs bookings to a file until you add them.

## 4. Verify your mobile in Twilio (trial requirement)

Twilio trial accounts can only send SMS / place calls to **verified**
numbers. In the Twilio Console go to **Phone Numbers → Manage → Verified
Caller IDs** and add your own mobile. (Inbound calls to your trial number
work without this — verification is what lets the booking SMS reach you.)

## 5. Start the server

```bash
npm start
```

You should see: `AI receptionist listening on port 3000`.

## 6. Expose it to the internet with ngrok

In a second terminal:

```bash
ngrok http 3000
```

Copy the `https://....ngrok-free.app` URL it prints. (Install ngrok from
https://ngrok.com if you don't have it — the free tier is fine.)

## 7. Point your Twilio number at the webhook

In the Twilio Console:

1. **Phone Numbers → Manage → Active numbers →** click your trial number.
2. Scroll to **Voice Configuration**.
3. **"A call comes in"** → set to **Webhook**, URL =
   `https://<your-ngrok-subdomain>.ngrok-free.app/voice`, method **HTTP POST**.
4. *(Optional)* **"Call status changes"** →
   `https://<your-ngrok-subdomain>.ngrok-free.app/call-status`, HTTP POST.
5. **Save**.

## 8. Call your trial number

From your phone, dial your Twilio trial number. You'll hear the trial
notice, then the receptionist greeting. Talk to it — ask your hours,
prices, or try booking an appointment.

---

## Notes & gotchas

- **The ngrok URL changes** every time you restart ngrok on the free tier.
  When it does, update the webhook URL in step 7 to match.
- Keep **both** the server and ngrok running while testing.
- Test the agent's brain with **no phone at all**: `npm run chat`.
- Want the natural ElevenLabs voice? Set `TTS_PROVIDER=elevenlabs`,
  `ELEVENLABS_API_KEY`, and `PUBLIC_BASE_URL=https://<your-ngrok-subdomain>.ngrok-free.app`
  in `.env`, then restart. See README for details.
- Booking SMS only reaches **verified** numbers on a trial account (step 4).
