const fs = require('fs');
const path = require('path');
const { callLLM } = require('./llm');

const KB_PATH = path.join(__dirname, '..', 'knowledge-base', 'business.md');
const BUSINESS_NAME = process.env.BUSINESS_NAME || 'the business';

function loadKnowledgeBase() {
  try {
    return fs.readFileSync(KB_PATH, 'utf8');
  } catch {
    return '(no knowledge base file found)';
  }
}

// The model is forced to call this tool every turn. Its arguments are the
// single source of truth for what gets spoken and how the call proceeds.
// (JSON Schema here works for both OpenAI-style and Anthropic providers.)
const RESPOND_TOOL = {
  name: 'respond_to_caller',
  description: 'Decide what to say next to the phone caller and how to route the call.',
  parameters: {
    type: 'object',
    properties: {
      speech: {
        type: 'string',
        description:
          'What to say to the caller next, out loud. One or two short spoken sentences, plain text only — no markdown, no lists, no headers.'
      },
      action: {
        type: 'string',
        enum: ['continue', 'transfer', 'capture_lead', 'book_appointment', 'end_call'],
        description:
          "continue: keep listening for the caller's next reply. " +
          'transfer: the caller explicitly asked for a human, sounds upset, or the answer is not in the knowledge base. ' +
          'capture_lead: caller wants a callback (no specific time). Use only once you have BOTH their name and phone number. ' +
          'book_appointment: caller wants an appointment at a specific date/time. Use only once you have their name, phone number, AND the desired time. ' +
          "end_call: the caller said goodbye or the conversation is clearly finished."
      },
      lead_name: { type: 'string', description: 'Caller name. Set for capture_lead or book_appointment.' },
      lead_phone: { type: 'string', description: 'Caller phone number. Set for capture_lead or book_appointment.' },
      lead_reason: { type: 'string', description: 'What the callback/appointment is for. Set for capture_lead or book_appointment.' },
      appointment_time: {
        type: 'string',
        description:
          'Desired appointment date and time as an ISO 8601 datetime (e.g. 2026-07-10T15:00:00). Resolve relative times like "tomorrow at 3pm" using the current date given in the system prompt. Only set for book_appointment.'
      }
    },
    required: ['speech', 'action']
  }
};

function buildSystemPrompt() {
  const kb = loadKnowledgeBase();
  const today = new Date().toISOString().slice(0, 10);
  return `You are the AI phone receptionist for ${BUSINESS_NAME}, answering a live phone call.
Today's date is ${today}.

Rules:
- Ground every factual answer (hours, pricing, services, policies) strictly in the KNOWLEDGE BASE below. Never invent or guess prices, hours, or policies that are not written there.
- If the caller asks something the knowledge base doesn't cover, asks for a human, or sounds upset or frustrated: use action "transfer".
- Booking: if the caller wants an appointment, collect their name, phone number, and preferred date/time (ask with action "continue"). Once you have all three, use action "book_appointment" and put the time in appointment_time as ISO 8601, respecting the business hours in the knowledge base. If they just want a callback with no specific time, use "capture_lead" once you have their name and number.
- Keep every reply short and conversational, like a real phone call — one or two sentences, never a list or markdown.
- You must always respond by calling the respond_to_caller tool.

KNOWLEDGE BASE:
${kb}`;
}

/**
 * @param {{role: 'user'|'assistant', content: string}[]} history
 * @param {string} callerMessage
 */
async function getAgentReply(history, callerMessage) {
  const messages = [...history, { role: 'user', content: callerMessage }];

  let input;
  try {
    input = await callLLM({ system: buildSystemPrompt(), messages, tool: RESPOND_TOOL });
  } catch (err) {
    console.error('LLM error:', err.message);
    return { speech: "Sorry, could you say that again?", action: 'continue', lead: null };
  }

  const { speech, action, lead_name, lead_phone, lead_reason, appointment_time } = input || {};

  const needsContact = action === 'capture_lead' || action === 'book_appointment';
  const lead =
    needsContact && lead_phone
      ? { name: lead_name || null, phone: lead_phone, reason: lead_reason || null, appointment_time: appointment_time || null }
      : null;

  // If the model claimed a lead/booking without a phone number, keep talking
  // instead of falsely recording it.
  const resolvedAction = needsContact && !lead ? 'continue' : action || 'continue';

  return { speech: speech || "Sorry, could you say that again?", action: resolvedAction, lead };
}

module.exports = { getAgentReply, buildSystemPrompt };
