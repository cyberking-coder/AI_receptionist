// Talk to the receptionist agent's brain directly in the terminal, no
// Twilio or phone number required. Useful for iterating on the knowledge
// base and prompt before wiring up real calls.
require('dotenv').config();
const readline = require('readline');
const { getAgentReply } = require('../src/agent');
const { providerName, model } = require('../src/llm');

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
    if (result.action === 'transfer' || result.action === 'end_call') {
      rl.close();
      return;
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
  rl.prompt();
});
