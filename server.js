require('dotenv').config();
const path = require('path');
const express = require('express');
const twilio = require('twilio');

const { getAgentReply } = require('./src/agent');
const { getSession, endSession } = require('./src/session');
const { saveLead } = require('./src/leads');
const { bookAppointment } = require('./src/booking');
const { sendSms } = require('./src/sms');
const { synthesize, AUDIO_DIR } = require('./src/tts');
const { formatTime, formatDateTime } = require('./src/datetime');

const { VoiceResponse } = twilio.twiml;

const app = express();
app.use(express.urlencoded({ extended: false }));
// Serve ElevenLabs-generated MP3s so Twilio can <Play> them.
app.use('/audio', express.static(AUDIO_DIR));

const VOICE = process.env.TTS_VOICE || 'Polly.Joanna-Neural';
const BUSINESS_NAME = process.env.BUSINESS_NAME || 'our office';
const HUMAN_TRANSFER_NUMBER = process.env.HUMAN_TRANSFER_NUMBER;
const MAX_NO_INPUT_RETRIES = 2;

// Speak `text` on `node` (a <Response> or <Gather>): play an ElevenLabs clip
// if TTS is enabled and synthesis succeeds, else use Twilio's built-in voice.
async function voiceLine(node, text) {
  const url = await synthesize(text);
  if (url) node.play(url);
  else node.say({ voice: VOICE }, text);
}

async function gather(twiml, promptText) {
  const g = twiml.gather({
    input: 'speech',
    action: '/handle-speech',
    method: 'POST',
    speechTimeout: 'auto',
    speechModel: 'phone_call'
  });
  await voiceLine(g, promptText);
}

async function transferOrEnd(twiml) {
  if (HUMAN_TRANSFER_NUMBER) {
    twiml.dial(HUMAN_TRANSFER_NUMBER);
  } else {
    await voiceLine(twiml, "I'm sorry, no one is available to take your call right now. Goodbye.");
    twiml.hangup();
  }
}

// Twilio hits this when a call first comes in.
app.post('/voice', async (req, res) => {
  const session = getSession(req.body.CallSid);
  session.callerNumber = req.body.From;

  const twiml = new VoiceResponse();
  await gather(twiml, `Thanks for calling ${BUSINESS_NAME}. How can I help you today?`);
  // Only reached if Gather itself fails to redirect (belt and suspenders).
  await voiceLine(twiml, "Sorry, I didn't catch that. Goodbye.");
  twiml.hangup();
  res.type('text/xml').send(twiml.toString());
});

// Twilio hits this after each Gather completes — either with SpeechResult,
// or empty if the caller said nothing before the timeout.
app.post('/handle-speech', async (req, res) => {
  const callSid = req.body.CallSid;
  const session = getSession(callSid);
  const speechResult = (req.body.SpeechResult || '').trim();
  const twiml = new VoiceResponse();

  if (!speechResult) {
    session.retries += 1;
    if (session.retries > MAX_NO_INPUT_RETRIES) {
      await voiceLine(twiml, "I'm having trouble hearing you.");
      await transferOrEnd(twiml);
      endSession(callSid);
      return res.type('text/xml').send(twiml.toString());
    }
    await gather(twiml, "Sorry, I didn't catch that. Could you say that again?");
    return res.type('text/xml').send(twiml.toString());
  }
  session.retries = 0;

  let result;
  try {
    result = await getAgentReply(session.history, speechResult);
  } catch (err) {
    console.error('Agent error:', err);
    await voiceLine(twiml, "Sorry, I'm having a technical issue. Let me transfer you.");
    await transferOrEnd(twiml);
    endSession(callSid);
    return res.type('text/xml').send(twiml.toString());
  }

  session.history.push({ role: 'user', content: speechResult });

  const callInfo = { callSid, callerNumber: session.callerNumber };
  let speech = result.speech;
  let action = result.action;

  if (action === 'capture_lead' && result.lead) {
    saveLead(result.lead, callInfo);
  } else if (action === 'book_appointment' && result.lead) {
    // Booking may override what we say (e.g. the slot is taken) and always
    // resolves to "continue" so the caller can respond.
    const outcome = await handleBooking(result, session, callInfo);
    speech = outcome.speech;
    action = outcome.action;
  }

  // Record what we actually said (post-override) so the agent's next turn
  // has accurate context.
  session.history.push({ role: 'assistant', content: speech });

  switch (action) {
    case 'transfer':
      await voiceLine(twiml, speech);
      await transferOrEnd(twiml);
      endSession(callSid);
      break;
    case 'end_call':
      await voiceLine(twiml, speech);
      twiml.hangup();
      endSession(callSid);
      break;
    case 'capture_lead':
    case 'continue':
    default:
      await gather(twiml, speech);
      break;
  }

  res.type('text/xml').send(twiml.toString());
});

// Check availability, book (or suggest alternatives), and text a
// confirmation. Returns the speech to say next and the follow-up action.
async function handleBooking(result, session, callInfo) {
  let outcome;
  try {
    outcome = await bookAppointment(result.lead, callInfo);
  } catch (err) {
    console.error('Booking error:', err.message);
    return { speech: result.speech, action: 'continue' };
  }

  switch (outcome.status) {
    case 'booked':
      await sendConfirmationSms(
        result.lead,
        session,
        `Your appointment is confirmed for ${formatDateTime(outcome.when)}.`
      );
      return { speech: result.speech, action: 'continue' }; // keep agent's confirmation

    case 'logged':
      await sendConfirmationSms(
        result.lead,
        session,
        `We received your appointment request for ${formatDateTime(outcome.when)} and will confirm shortly.`
      );
      return { speech: result.speech, action: 'continue' };

    case 'unavailable': {
      const alts = outcome.alternatives || [];
      if (alts.length === 0) {
        return {
          speech:
            "I'm sorry, that time is already booked and I don't see any nearby openings. Would you like someone to call you back with more options?",
          action: 'continue'
        };
      }
      const list = alts.map(formatTime).join(' or ');
      return {
        speech: `I'm sorry, that time is already booked. The next openings I have are ${list}. Would either of those work?`,
        action: 'continue'
      };
    }

    case 'invalid_time':
    default:
      return {
        speech: "Sorry, I didn't catch a valid time. What day and time would you like to come in?",
        action: 'continue'
      };
  }
}

async function sendConfirmationSms(lead, session, body) {
  const to = (lead && lead.phone) || session.callerNumber;
  const res = await sendSms(to, `${BUSINESS_NAME}: ${body}`);
  if (!res.sent && res.reason !== 'twilio-not-configured') {
    console.warn('Confirmation SMS not sent:', res.reason);
  }
}

// Optional: point Twilio's "status callback" here to clean up sessions
// promptly when a call ends (hangup, no-answer, etc).
app.post('/call-status', (req, res) => {
  if (['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(req.body.CallStatus)) {
    endSession(req.body.CallSid);
  }
  res.sendStatus(200);
});

app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`AI receptionist listening on port ${PORT}`));
