# Google Calendar setup

The agent books appointments using a **service account** — a robot Google
user. You create it, download its key, and share your calendar with it.
This takes ~10 minutes and is free.

## Part A — Create the service account & key

1. Go to the [Google Cloud Console](https://console.cloud.google.com).
2. Top bar → project dropdown → **New Project** (name it e.g.
   "ai-receptionist"), then select it.
3. **APIs & Services → Library** → search **"Google Calendar API"** →
   **Enable**.
4. **APIs & Services → Credentials → Create Credentials → Service
   account**. Give it a name, click **Create and Continue**, skip the
   optional steps, **Done**.
5. Click the new service account → **Keys** tab → **Add Key → Create new
   key → JSON**. A `.json` file downloads. **This is a secret — never
   commit it.**
6. Copy the service account's **email** (looks like
   `ai-receptionist@your-project.iam.gserviceaccount.com`) — you'll need
   it in Part B.

## Part B — Create a calendar & share it with the service account

A service account can't see your personal calendar unless you share it.
Best practice: make a dedicated calendar for appointments.

1. Go to [Google Calendar](https://calendar.google.com).
2. Left sidebar → **Other calendars → +** → **Create new calendar**. Name
   it (e.g. "Appointments"), **Create calendar**.
3. Open that calendar's **Settings** (hover it → ⋮ → Settings).
4. Under **Share with specific people or groups → Add people** → paste the
   service account **email** from Part A step 6 → set permission to
   **"Make changes to events"** → **Send**.
5. Still in Settings, scroll to **Integrate calendar → Calendar ID** and
   copy it. (For a dedicated calendar it looks like
   `abc123...@group.calendar.google.com`; for your primary calendar it's
   your email.)

## Part C — Put them in your config

You have two ways to provide the key JSON:

**Local (.env with a file path):**
```
GOOGLE_SERVICE_ACCOUNT_JSON=/absolute/path/to/downloaded-key.json
GOOGLE_CALENDAR_ID=abc123...@group.calendar.google.com
APPOINTMENT_TIMEZONE=America/New_York
```

**Cloud host like Render (paste the JSON inline):** open the downloaded
`.json`, copy its entire contents, and paste it as the value of
`GOOGLE_SERVICE_ACCOUNT_JSON` (the app accepts either a path or inline
JSON). Set `GOOGLE_CALENDAR_ID` to the ID from Part B step 5.

## Part D — Verify it works

Before wiring up the phone, test the connection:

```bash
npm run test:calendar
```

It confirms the credentials load, the service account can read the
calendar (free/busy), and — if you pass `--create` — that it can create an
event:

```bash
npm run test:calendar -- --create
```

If you see a permission error, re-check Part B step 4 (the calendar must
be shared with the service account email with "Make changes to events").

---

Once verified, the agent automatically checks availability and books real
events during calls. Without these vars set, it just logs booking requests
to `logs/bookings.jsonl` — so this is entirely optional.
