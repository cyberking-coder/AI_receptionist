// Cal.com booking provider. Uses the v2 API to check availability (slots)
// and create bookings. No Google Cloud needed — just a Cal.com API key and
// an event type ID.
//
// API versions are pinned per endpoint (Cal.com versions its v2 API by date):
//   /slots    -> cal-api-version: 2024-09-04
//   /bookings -> cal-api-version: 2024-08-13
const API = process.env.CALCOM_API_BASE || 'https://api.cal.com/v2';
const TIMEZONE = process.env.APPOINTMENT_TIMEZONE || 'America/New_York';
const SUGGEST_WINDOW_HOURS = parseInt(process.env.SUGGEST_WINDOW_HOURS || '3', 10);
const MAX_ALTERNATIVES = 2;

function calcomConfigured() {
  return !!(process.env.CALCOM_API_KEY && process.env.CALCOM_EVENT_TYPE_ID);
}

function headers(version) {
  return {
    Authorization: `Bearer ${process.env.CALCOM_API_KEY}`,
    'cal-api-version': version,
    'Content-Type': 'application/json'
  };
}

// Cal.com requires an attendee email, but phone callers give a phone, not an
// email. Use a configured address for all bookings, or synthesize a unique
// placeholder from the phone so bookings don't collide. The caller still gets
// our Twilio SMS confirmation; the business sees the booking in Cal.com.
function attendeeEmail(phone) {
  if (process.env.CALCOM_ATTENDEE_EMAIL) return process.env.CALCOM_ATTENDEE_EMAIL;
  const digits = String(phone || '').replace(/\D/g, '') || 'caller';
  return `caller-${digits}@example.com`;
}

// Normalize the slots response into a sorted array of epoch ms. The endpoint
// returns data either keyed by date ({ "2026-07-10": [{ start }] }) or as a
// flat array depending on version, so handle both.
function normalizeSlots(data) {
  const raw = [];
  if (Array.isArray(data)) {
    for (const s of data) raw.push(s.start || s.time || s);
  } else if (data && typeof data === 'object') {
    for (const day of Object.keys(data)) {
      const arr = data[day];
      if (Array.isArray(arr)) for (const s of arr) raw.push(s.start || s.time || s);
    }
  }
  return raw
    .map((iso) => new Date(iso).getTime())
    .filter((t) => !isNaN(t))
    .sort((a, b) => a - b);
}

async function getSlotStarts(startISO, endISO) {
  const params = new URLSearchParams({
    eventTypeId: String(process.env.CALCOM_EVENT_TYPE_ID),
    start: startISO,
    end: endISO,
    timeZone: TIMEZONE
  });
  const res = await fetch(`${API}/slots?${params.toString()}`, { headers: headers('2024-09-04') });
  if (!res.ok) throw new Error(`slots ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return normalizeSlots(json.data);
}

async function createBooking({ name, phone, reason, startISO }) {
  const body = {
    start: startISO,
    eventTypeId: Number(process.env.CALCOM_EVENT_TYPE_ID),
    attendee: {
      name: name || 'Caller',
      email: attendeeEmail(phone),
      timeZone: TIMEZONE,
      language: 'en',
      ...(phone ? { phoneNumber: phone } : {})
    },
    ...(reason ? { metadata: { reason } } : {})
  };
  const res = await fetch(`${API}/bookings`, {
    method: 'POST',
    headers: headers('2024-08-13'),
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`booking ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const uid = json.data?.uid;
  return { uid, link: uid ? `https://cal.com/booking/${uid}` : undefined };
}

/**
 * Check availability and book via Cal.com.
 * @returns {Promise<{status:'booked'|'unavailable', when:string, alternatives?:string[], link?:string}>}
 */
async function bookViaCalcom({ name, phone, reason, startISO }) {
  const startMs = new Date(startISO).getTime();
  const windowEndISO = new Date(startMs + SUGGEST_WINDOW_HOURS * 3600000).toISOString();

  const slots = await getSlotStarts(startISO, windowEndISO);
  const requestedAvailable = slots.some((t) => t === startMs);

  if (!requestedAvailable) {
    const alternatives = slots
      .filter((t) => t > startMs)
      .slice(0, MAX_ALTERNATIVES)
      .map((t) => new Date(t).toISOString());
    return { status: 'unavailable', when: startISO, alternatives };
  }

  const { link } = await createBooking({ name, phone, reason, startISO });
  return { status: 'booked', when: startISO, link };
}

module.exports = { calcomConfigured, bookViaCalcom };
