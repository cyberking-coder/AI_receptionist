// Verify Google Calendar credentials and access without touching the phone.
//   npm run test:calendar            -> checks creds + reads free/busy
//   npm run test:calendar -- --create -> also creates a short test event
require('dotenv').config();
const fs = require('fs');

const { GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_CALENDAR_ID } = process.env;
const TIMEZONE = process.env.APPOINTMENT_TIMEZONE || 'America/New_York';

if (!GOOGLE_SERVICE_ACCOUNT_JSON || !GOOGLE_CALENDAR_ID) {
  console.error('Set GOOGLE_SERVICE_ACCOUNT_JSON and GOOGLE_CALENDAR_ID in .env first.');
  console.error('See GOOGLE_CALENDAR_SETUP.md.');
  process.exit(1);
}

async function main() {
  const { google } = require('googleapis');

  let credentials;
  try {
    credentials = fs.existsSync(GOOGLE_SERVICE_ACCOUNT_JSON)
      ? JSON.parse(fs.readFileSync(GOOGLE_SERVICE_ACCOUNT_JSON, 'utf8'))
      : JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);
  } catch (err) {
    console.error('Could not read/parse GOOGLE_SERVICE_ACCOUNT_JSON:', err.message);
    process.exitCode = 1;
    return;
  }
  console.log('✓ Credentials loaded for:', credentials.client_email);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/calendar']
  });
  const calendar = google.calendar({ version: 'v3', auth });

  const now = new Date();
  const inOneHour = new Date(now.getTime() + 3600000);

  // Read test: free/busy
  try {
    const res = await calendar.freebusy.query({
      requestBody: {
        timeMin: now.toISOString(),
        timeMax: inOneHour.toISOString(),
        timeZone: TIMEZONE,
        items: [{ id: GOOGLE_CALENDAR_ID }]
      }
    });
    const busy = res.data.calendars?.[GOOGLE_CALENDAR_ID]?.busy || [];
    console.log(`✓ Read calendar OK. Busy blocks in the next hour: ${busy.length}`);
  } catch (err) {
    console.error('✗ Could not read the calendar:', err.message);
    console.error('  Check the calendar is shared with the service account email (Part B step 4).');
    process.exitCode = 1;
    return;
  }

  // Optional write test
  if (process.argv.includes('--create')) {
    const start = new Date(now.getTime() + 24 * 3600000); // tomorrow, same time
    const end = new Date(start.getTime() + 30 * 60000);
    try {
      const res = await calendar.events.insert({
        calendarId: GOOGLE_CALENDAR_ID,
        requestBody: {
          summary: 'AI receptionist test event (safe to delete)',
          description: 'Created by npm run test:calendar --create',
          start: { dateTime: start.toISOString(), timeZone: TIMEZONE },
          end: { dateTime: end.toISOString(), timeZone: TIMEZONE }
        }
      });
      console.log('✓ Created test event:', res.data.htmlLink || res.data.id);
      console.log('  (Open your calendar and delete it if you like.)');
    } catch (err) {
      console.error('✗ Could not create an event:', err.message);
      console.error('  The share permission must be "Make changes to events".');
      process.exitCode = 1;
      return;
    }
  }

  console.log('\nAll good — calendar booking is ready.');
}

main().catch((err) => {
  console.error('Unexpected error:', err.message);
  process.exitCode = 1;
});
