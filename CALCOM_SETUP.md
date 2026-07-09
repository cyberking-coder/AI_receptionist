# Cal.com setup (recommended booking provider)

Cal.com is a free, open-source scheduling platform. Unlike Google's service
accounts (which your org policy blocks), it uses a simple API key — no
Google Cloud, no key files. It also handles availability, reminders, and
reschedule links for you.

## Steps (~5 minutes)

1. Sign up free at https://cal.com and finish onboarding (it asks for your
   availability — that becomes what the agent offers callers).
2. Create the appointment type callers will book:
   - **Event Types → + New** (e.g. "Consultation", 30 min). Save.
3. Get the **event type ID**:
   - Open that event type. The ID is in the URL, e.g.
     `app.cal.com/event-types/**12345**` → `12345`.
4. Create an **API key**:
   - **Settings → Developer → API keys → + Add** → copy it (starts with
     `cal_`). Store it safely.
5. Set your booking timezone to match your business.

## Put them in your config

```
CALCOM_API_KEY=cal_live_xxxxxxxx
CALCOM_EVENT_TYPE_ID=12345
APPOINTMENT_TIMEZONE=America/New_York
```

(On Render, set these in the dashboard env vars instead of a file.)

Optional: set `CALCOM_ATTENDEE_EMAIL` to a real address to receive all
booking notifications there. Phone callers don't give an email, so without
this the app synthesizes a placeholder per caller — the booking still lands
on your Cal.com calendar, and the caller gets our Twilio SMS confirmation.

## Verify it works

```bash
npm run test:calcom          # confirms the key works and shows the next open slot
npm run test:calcom -- --book  # also books the next slot (cancel it after in Cal.com)
```

If you see a 401/403, re-check the API key. If "No open slots", add
availability to the event type's schedule in Cal.com.

---

Once set, during a call the agent checks Cal.com availability, offers open
times when the requested slot is taken, and creates the booking — then texts
the caller a confirmation. Without these vars, bookings are just logged to
`logs/bookings.jsonl`.
