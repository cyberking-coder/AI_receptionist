// SMS confirmations via Twilio. No-ops gracefully if Twilio isn't configured
// so the call flow never breaks on a texting failure.
//
// Note: on a Twilio *trial* account you can only text numbers you've verified
// in the console. Upgrade to text arbitrary callers.

const FROM = process.env.TWILIO_PHONE_NUMBER;

function smsConfigured() {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && FROM);
}

// Best-effort normalization to E.164 (US-centric). Twilio needs +country code.
function normalizePhone(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (trimmed.startsWith('+')) return trimmed.replace(/[^\d+]/g, '');
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null; // unknown format — let caller fall back to their caller ID
}

let client;
function getClient() {
  if (!client) {
    const twilio = require('twilio');
    client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return client;
}

/**
 * @param {string} to  destination phone (any format; normalized here)
 * @param {string} body  message text
 * @returns {Promise<{sent:boolean, sid?:string, reason?:string}>}
 */
async function sendSms(to, body) {
  if (!smsConfigured()) return { sent: false, reason: 'twilio-not-configured' };
  const dest = normalizePhone(to);
  if (!dest) return { sent: false, reason: 'invalid-destination' };

  try {
    const msg = await getClient().messages.create({ to: dest, from: FROM, body });
    return { sent: true, sid: msg.sid };
  } catch (err) {
    console.error('SMS send failed:', err.message);
    return { sent: false, reason: err.message };
  }
}

module.exports = { sendSms, smsConfigured, normalizePhone };
