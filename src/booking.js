// Appointment booking. If Google Calendar is configured (service-account
// credentials + a calendar ID), we create a real event. Otherwise we record
// the requested booking to logs/bookings.jsonl so a human can confirm it —
// so the flow works out of the box and becomes "real" once you add creds.
const fs = require('fs');
const path = require('path');

const BOOKINGS_FILE = path.join(__dirname, '..', 'logs', 'bookings.jsonl');
const DEFAULT_DURATION_MIN = parseInt(process.env.APPOINTMENT_DURATION_MIN || '30', 10);
const TIMEZONE = process.env.APPOINTMENT_TIMEZONE || 'America/New_York';

function logBooking(entry) {
  fs.mkdirSync(path.dirname(BOOKINGS_FILE), { recursive: true });
  fs.appendFileSync(BOOKINGS_FILE, JSON.stringify(entry) + '\n');
}

function googleConfigured() {
  return !!(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.GOOGLE_CALENDAR_ID);
}

async function createGoogleEvent({ name, phone, reason, startISO, endISO }) {
  const { google } = require('googleapis');

  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  // Accept either a path to the JSON key file or the JSON inline.
  const credentials = fs.existsSync(raw) ? JSON.parse(fs.readFileSync(raw, 'utf8')) : JSON.parse(raw);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/calendar']
  });
  const calendar = google.calendar({ version: 'v3', auth });

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
 *   appointment_time should be an ISO 8601 datetime (the agent is told the
 *   current date so it can resolve "tomorrow at 3pm").
 * @param {object} callInfo
 * @returns {Promise<{status:'booked'|'logged', when:string|null, link?:string}>}
 */
async function bookAppointment(req, callInfo = {}) {
  const startDate = req.appointment_time ? new Date(req.appointment_time) : null;
  const valid = startDate && !isNaN(startDate.getTime());
  const startISO = valid ? startDate.toISOString() : null;
  const endISO = valid ? new Date(startDate.getTime() + DEFAULT_DURATION_MIN * 60000).toISOString() : null;

  const base = {
    name: req.name || null,
    phone: req.phone || null,
    reason: req.reason || null,
    requestedTime: req.appointment_time || null,
    ...callInfo,
    createdAt: new Date().toISOString()
  };

  if (valid && googleConfigured()) {
    try {
      const link = await createGoogleEvent({ ...req, startISO, endISO });
      logBooking({ ...base, status: 'booked', calendarLink: link });
      return { status: 'booked', when: startISO, link };
    } catch (err) {
      console.error('Google Calendar booking failed, logging instead:', err.message);
    }
  }

  // Fallback: record for a human to confirm.
  logBooking({ ...base, status: 'logged' });
  return { status: 'logged', when: startISO };
}

module.exports = { bookAppointment, googleConfigured };
