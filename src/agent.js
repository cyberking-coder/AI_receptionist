const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const KB_PATH = path.join(__dirname, '..', 'knowledge-base', 'business.md');
const BUSINESS_NAME = process.env.BUSINESS_NAME || 'the business';

function loadKnowledgeBase() {
  try {
    return fs.readFileSync(KB_PATH, 'utf8');
  } catch {
    return '(no knowledge base file found)';
  }
}

// Claude must always call this tool. Its arguments are the single source of
// truth for what gets spoken and how the call proceeds next.
const RESPOND_TOOL = {
  name: 'respond_to_caller',
  description: "Decide what to say next to the phone caller and how to route the call.",
  input_schema: {
    type: 'object',
    properties: {
      speech: {
        type: 'string',
        description:
          'What to say to the caller next, out loud. One or two short spoken sentences, plain text only — no markdown, no lists, no headers.'
      },
      action: {
        type: 'string',
        enum: ['continue', 'transfer', 'capture_lead', 'end_call'],
        description:
          "continue: keep listening for the caller's next reply. " +
          'transfer: the caller explicitly asked for a human, sounds upset, or the answer is not in the knowledge base. ' +
          'capture_lead: use only once you have already collected BOTH the caller name and phone number for a booking or callback request. ' +
          "end_call: the caller said goodbye or the conversation is clearly finished."
      },
      lead_name: { type: 'string', description: 'Caller name. Only set when action is capture_lead.' },
      lead_phone: { type: 'string', description: 'Caller phone number. Only set when action is capture_lead.' },
      lead_reason: { type: 'string', description: 'What the callback/appointment is for. Only set when action is capture_lead.' }
    },
    required: ['speech', 'action']
  }
};

function buildSystemPrompt() {
  const kb = loadKnowledgeBase();
  return `You are the AI phone receptionist for ${BUSINESS_NAME}, answering a live phone call.

Rules:
- Ground every factual answer (hours, pricing, services, policies) strictly in the KNOWLEDGE BASE below. Never invent or guess prices, hours, or policies that are not written there.
- If the caller asks something the knowledge base doesn't cover, asks for a human, or sounds upset or frustrated: use action "transfer".
- If the caller wants to book an appointment or a callback: first ask for their name and phone number (using action "continue" while you ask), and only use action "capture_lead" once you actually have both.
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

  const response = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
    max_tokens: 400,
    system: buildSystemPrompt(),
    tools: [RESPOND_TOOL],
    tool_choice: { type: 'tool', name: 'respond_to_caller' },
    messages
  });

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  if (!toolUse) {
    return { speech: "Sorry, could you say that again?", action: 'continue', lead: null };
  }

  const { speech, action, lead_name, lead_phone, lead_reason } = toolUse.input;
  const lead =
    action === 'capture_lead' && lead_phone
      ? { name: lead_name || null, phone: lead_phone, reason: lead_reason || null }
      : null;

  return { speech, action: lead ? action : action === 'capture_lead' ? 'continue' : action, lead };
}

module.exports = { getAgentReply, buildSystemPrompt };
