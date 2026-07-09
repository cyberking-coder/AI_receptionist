// Verify Cal.com credentials and availability without touching the phone.
//   npm run test:calcom            -> checks API key + reads upcoming slots
//   npm run test:calcom -- --book  -> also books the next available slot
require('dotenv').config();
process.env.TZ = process.env.APPOINTMENT_TIMEZONE || process.env.TZ || 'America/New_York';

const { calcomConfigured, bookViaCalcom } = require('../src/calcom');
const { formatDateTime } = require('../src/datetime');

if (!calcomConfigured()) {
  console.error('Set CALCOM_API_KEY and CALCOM_EVENT_TYPE_ID in .env first. See CALCOM_SETUP.md.');
  process.exit(1);
}

const API = process.env.CALCOM_API_BASE || 'https://api.cal.com/v2';
const TIMEZONE = process.env.APPOINTMENT_TIMEZONE || 'America/New_York';

async function main() {
  const start = new Date();
  const end = new Date(start.getTime() + 7 * 24 * 3600000); // next 7 days

  const params = new URLSearchParams({
    eventTypeId: String(process.env.CALCOM_EVENT_TYPE_ID),
    start: start.toISOString(),
    end: end.toISOString(),
    timeZone: TIMEZONE
  });

  let json;
  try {
    const res = await fetch(`${API}/slots?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${process.env.CALCOM_API_KEY}`,
        'cal-api-version': '2024-09-04'
      }
    });
    const text = await res.text();
    if (!res.ok) {
      console.error(`✗ Slots request failed (${res.status}): ${text}`);
      console.error('  Check CALCOM_API_KEY, CALCOM_EVENT_TYPE_ID, and that');
      console.error('  APPOINTMENT_TIMEZONE is a valid IANA zone (e.g. Asia/Kolkata,');
      console.error('  America/New_York). See CALCOM_SETUP.md.');
      process.exitCode = 1;
      return;
    }
    json = JSON.parse(text);
  } catch (err) {
    console.error('✗ Could not reach Cal.com:', err.message);
    process.exitCode = 1;
    return;
  }

  // Flatten whatever shape came back into a count + first slot.
  const data = json.data || {};
  const firstDay = Array.isArray(data) ? null : Object.keys(data)[0];
  const firstSlot = Array.isArray(data)
    ? data[0]?.start
    : firstDay && data[firstDay]?.[0]?.start;

  console.log('✓ Connected to Cal.com and read availability.');
  if (firstSlot) {
    console.log(`  Next available slot: ${formatDateTime(firstSlot)}`);
  } else {
    console.log('  No open slots in the next 7 days (check the event type\'s availability schedule).');
  }

  if (process.argv.includes('--book')) {
    if (!firstSlot) {
      console.error('✗ No slot to book. Add availability to the event type and retry.');
      process.exitCode = 1;
      return;
    }
    try {
      const outcome = await bookViaCalcom({
        name: 'Test Caller',
        phone: '+15555550100',
        reason: 'test booking (safe to cancel)',
        startISO: new Date(firstSlot).toISOString()
      });
      console.log(`✓ Booking ${outcome.status}${outcome.link ? ` -> ${outcome.link}` : ''}`);
      console.log('  (Open Cal.com and cancel it if you like.)');
    } catch (err) {
      console.error('✗ Booking failed:', err.message);
      process.exitCode = 1;
      return;
    }
  }

  console.log('\nAll good — Cal.com booking is ready.');
}

main().catch((err) => {
  console.error('Unexpected error:', err.message);
  process.exitCode = 1;
});
