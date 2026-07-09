// Appointment booking with availability checking.
//
// If Google Calendar is configured (service-account creds + a calendar ID),
// we check free/busy before booking, suggest alternative slots when the
// requested time is taken, and create a real event when it's free. Without
// Google config, we can't check availability, so we record the request to
// logs/bookings.jsonl for a human to confirm.
const fs = require('fs');
const path = require('path');
const { calcomConfigured, bookViaCalcom } = require('./calcom');

const BOOKINGS_FILE = path.join(__dirname, '..', 'logs', 'bookings.jsonl');
const DEFAULT_DURATION_MIN = parseInt(process.env.APPOINTMENT_DURATION_MIN || '30', 10);
const TIMEZONE = process.env.APPOINTMENT_TIMEZONE || 'America/New_York';
const SUGGEST_WINDOW_HOURS = parseInt(process.env.SUGGEST_WINDOW_HOURS || '3', 10);
const MAX_ALTERNATIVES = 2;

function logBooking(entry) {
  fs.mkdirSync(path.dirname(BOOKINGS_FILE), { recursive: true });
  fs.appendFileSync(BOOKINGS_FILE, JSON.stringify(entry) + '\n');
}

function googleConfigured() {
  return !!(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.GOOGLE_CALENDAR_ID);
}

function getCalendar() {
  const { google } = require('googleapis');
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  // Accept either a path to the JSON key file or the JSON inline.
  const credentials = fs.existsSync(raw) ? JSON.parse(fs.readFileSync(raw, 'utf8')) : JSON.parse(raw);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/calendar']
  });
  return google.calendar({ version: 'v3', auth });
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Pure: given busy intervals, walk fixed-length candidate slots across a
 * window and return the free ones (as ISO strings). Exported for testing.
 * @param {{start:string,end:string}[]} busy
 */
function computeFreeSlots(busy, windowStartMs, windowEndMs, durationMs, maxSlots) {
  const busyMs = busy.map((b) => [Date.parse(b.start), Date.parse(b.end)]);
  const free = [];
  for (let t = windowStartMs; t + durationMs <= windowEndMs; t += durationMs) {
    const s = t;
    const e = t + durationMs;
    const clash = busyMs.some(([bs, be]) => overlaps(s, e, bs, be));
    if (!clash) {
      free.push(new Date(s).toISOString());
      if (free.length >= maxSlots) break;
    }
  }
  return free;
}

async function getBusy(calendar, timeMinISO, timeMaxISO) {
  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: timeMinISO,
      timeMax: timeMaxISO,
      timeZone: TIMEZONE,
      items: [{ id: process.env.GOOGLE_CALENDAR_ID }]
    }
  });
  const cal = res.data.calendars?.[process.env.GOOGLE_CALENDAR_ID];
  return cal?.busy || [];
}

async function createEvent(calendar, { name, phone, reason, startISO, endISO }) {
  const res = await calendar.events.insert({
    calendarId: process.env.GOOGLE_CALENDAR_ID,
    requestBody: {
      summary: `Appointment: ${name || 'Caller'}`,
      description: `Booked by AI receptionist.\nPhone: ${phone || 'n/a'}\nReason: ${reason || 'n/a'}`,
      start: { dateTime: startISO, timeZone: TIMEZONE },
      end: { dateTime: endISO, timeZone: TIMEZONE }
    }
  });
  return res.data.htmlLink || res.data.id;
}

/**
 * @param {{ name?:string, phone:string, reason?:string, appointment_time?:string }} req
 * @param {object} callInfo
 * @returns {Promise<{status:string, when:string|null, link?:string, alternatives?:string[]}>}
 *   status: 'booked' | 'logged' | 'unavailable' | 'invalid_time'
 */
async function bookAppointment(req, callInfo = {}) {
  const startDate = req.appointment_time ? new Date(req.appointment_time) : null;
  const valid = startDate && !isNaN(startDate.getTime());

  // Reject missing/unparseable or past times so the agent asks again.
  if (!valid || startDate.getTime() < Date.now()) {
    return { status: 'invalid_time', when: null };
  }

  const durationMs = DEFAULT_DURATION_MIN * 60000;
  const startISO = startDate.toISOString();
  const endISO = new Date(startDate.getTime() + durationMs).toISOString();

  const base = {
    name: req.name || null,
    phone: req.phone || null,
    reason: req.reason || null,
    requestedTime: startISO,
    ...callInfo,
    createdAt: new Date().toISOString()
  };

  // Cal.com takes priority when configured.
  if (calcomConfigured()) {
    try {
      const outcome = await bookViaCalcom({
        name: req.name,
        phone: req.phone,
        reason: req.reason,
        startISO
      });
      logBooking({
        ...base,
        status: outcome.status,
        ...(outcome.link ? { link: outcome.link } : {}),
        ...(outcome.alternatives ? { alternatives: outcome.alternatives } : {})
      });
      return outcome;
    } catch (err) {
      console.error('Cal.com booking failed, logging instead:', err.message);
      logBooking({ ...base, status: 'logged', error: err.message });
      return { status: 'logged', when: startISO };
    }
  }

  // No calendar wired up: can't check availability, so record for a human.
  if (!googleConfigured()) {
    logBooking({ ...base, status: 'logged' });
    return { status: 'logged', when: startISO };
  }

  try {
    const calendar = getCalendar();
    const windowEndMs = startDate.getTime() + SUGGEST_WINDOW_HOURS * 3600000;
    const busy = await getBusy(calendar, startISO, new Date(windowEndMs).toISOString());

    const requestedFree = !busy.some((b) =>
      overlaps(startDate.getTime(), startDate.getTime() + durationMs, Date.parse(b.start), Date.parse(b.end))
    );

    if (!requestedFree) {
      // Suggest the next free slots after the requested time.
      const alternatives = computeFreeSlots(
        busy,
        startDate.getTime() + durationMs,
        windowEndMs,
        durationMs,
        MAX_ALTERNATIVES
      );
      logBooking({ ...base, status: 'unavailable', alternatives });
      return { status: 'unavailable', when: startISO, alternatives };
    }

    const link = await createEvent(calendar, { ...req, startISO, endISO });
    logBooking({ ...base, status: 'booked', calendarLink: link });
    return { status: 'booked', when: startISO, link };
  } catch (err) {
    console.error('Calendar booking failed, logging instead:', err.message);
    logBooking({ ...base, status: 'logged', error: err.message });
    return { status: 'logged', when: startISO };
  }
}

module.exports = { bookAppointment, googleConfigured, computeFreeSlots };
