// Talk to the receptionist agent's brain directly in the terminal, no
// Twilio or phone number required. Useful for iterating on the knowledge
// base and prompt before wiring up real calls.
require('dotenv').config();
process.env.TZ = process.env.APPOINTMENT_TIMEZONE || process.env.TZ || 'America/New_York';
const readline = require('readline');
const { getAgentReply } = require('../src/agent');
const { providerName, model } = require('../src/llm');
const { saveLead } = require('../src/leads');
const { bookAppointment } = require('../src/booking');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const history = [];

console.log(`AI receptionist chat test  [provider: ${providerName}, model: ${model}]`);
console.log(`Type like a caller. Ctrl+C to quit.\n`);
console.log('Agent: Thanks for calling! How can I help you today?');

rl.setPrompt('You: ');
rl.prompt();

rl.on('line', async (line) => {
  const message = line.trim();
  if (!message) return rl.prompt();

  try {
    const result = await getAgentReply(history, message);
    history.push({ role: 'user', content: message });
    history.push({ role: 'assistant', content: result.speech });

    console.log(`Agent: ${result.speech}`);
    if (result.action !== 'continue') {
      console.log(`  [action: ${result.action}${result.lead ? `, lead: ${JSON.stringify(result.lead)}` : ''}]`);
    }

    // Exercise the same side effects a real call would, so you can see
    // leads and bookings land without any phone/Twilio setup.
    const callInfo = { callSid: 'chat-test', callerNumber: 'terminal' };
    if (result.action === 'capture_lead' && result.lead) {
      saveLead(result.lead, callInfo);
      console.log('  [saved lead to logs/leads.jsonl]');
    } else if (result.action === 'book_appointment' && result.lead) {
      const r = await bookAppointment(result.lead, callInfo);
      const alts = r.alternatives && r.alternatives.length ? ` alternatives: ${r.alternatives.join(', ')}` : '';
      console.log(`  [booking ${r.status}${r.when ? ` for ${r.when}` : ''}${r.link ? ` -> ${r.link}` : ''}${alts}]`);
    }

    if (result.action === 'transfer' || result.action === 'end_call') {
      rl.close();
      return;
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
  rl.prompt();
});
