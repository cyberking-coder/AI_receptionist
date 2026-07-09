// Small formatting helpers so times spoken to the caller and texted to them
// read naturally, in the business's configured timezone.
const TIMEZONE = process.env.APPOINTMENT_TIMEZONE || 'America/New_York';

function formatTime(iso) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(iso));
}

function formatDateTime(iso) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(iso));
}

module.exports = { formatTime, formatDateTime, TIMEZONE };
