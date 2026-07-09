require('dotenv').config();
const express = require('express');
const twilio = require('twilio');

const { getAgentReply } = require('./src/agent');
const { getSession, endSession } = require('./src/session');
const { saveLead } = require('./src/leads');

const { VoiceResponse } = twilio.twiml;

const app = express();
app.use(express.urlencoded({ extended: false }));

const VOICE = process.env.TTS_VOICE || 'Polly.Joanna-Neural';
const BUSINESS_NAME = process.env.BUSINESS_NAME || 'our office';
const HUMAN_TRANSFER_NUMBER = process.env.HUMAN_TRANSFER_NUMBER;
const MAX_NO_INPUT_RETRIES = 2;

function gather(twiml, promptText) {
  const g = twiml.gather({
    input: 'speech',
    action: '/handle-speech',
    method: 'POST',
    speechTimeout: 'auto',
    speechModel: 'phone_call'
  });
  g.say({ voice: VOICE }, promptText);
}

function transferOrEnd(twiml) {
  if (HUMAN_TRANSFER_NUMBER) {
    twiml.dial(HUMAN_TRANSFER_NUMBER);
  } else {
    twiml.say({ voice: VOICE }, "I'm sorry, no one is available to take your call right now. Goodbye.");
    twiml.hangup();
  }
}

// Twilio hits this when a call first comes in.
app.post('/voice', (req, res) => {
  const session = getSession(req.body.CallSid);
  session.callerNumber = req.body.From;

  const twiml = new VoiceResponse();
  gather(twiml, `Thanks for calling ${BUSINESS_NAME}. How can I help you today?`);
  // Only reached if Gather itself fails to redirect (belt and suspenders).
  twiml.say({ voice: VOICE }, "Sorry, I didn't catch that. Goodbye.");
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
      twiml.say({ voice: VOICE }, "I'm having trouble hearing you.");
      transferOrEnd(twiml);
      endSession(callSid);
      return res.type('text/xml').send(twiml.toString());
    }
    gather(twiml, "Sorry, I didn't catch that. Could you say that again?");
    return res.type('text/xml').send(twiml.toString());
  }
  session.retries = 0;

  let result;
  try {
    result = await getAgentReply(session.history, speechResult);
  } catch (err) {
    console.error('Agent error:', err);
    twiml.say({ voice: VOICE }, "Sorry, I'm having a technical issue. Let me transfer you.");
    transferOrEnd(twiml);
    endSession(callSid);
    return res.type('text/xml').send(twiml.toString());
  }

  session.history.push({ role: 'user', content: speechResult });
  session.history.push({ role: 'assistant', content: result.speech });

  if (result.action === 'capture_lead' && result.lead) {
    saveLead(result.lead, { callSid, callerNumber: session.callerNumber });
  }

  switch (result.action) {
    case 'transfer':
      twiml.say({ voice: VOICE }, result.speech);
      transferOrEnd(twiml);
      endSession(callSid);
      break;
    case 'end_call':
      twiml.say({ voice: VOICE }, result.speech);
      twiml.hangup();
      endSession(callSid);
      break;
    case 'capture_lead':
    case 'continue':
    default:
      gather(twiml, result.speech);
      break;
  }

  res.type('text/xml').send(twiml.toString());
});

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
