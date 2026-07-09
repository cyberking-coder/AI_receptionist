// Provider-agnostic LLM call. Pick a provider with LLM_PROVIDER:
//
//   groq      (default) - free cloud key from https://console.groq.com, no install
//   anthropic           - Claude, key from https://console.anthropic.com
//   ollama              - fully local & free, install from https://ollama.com
//   openai              - or any OpenAI-compatible endpoint
//
// All of them are driven through a single `callLLM` that forces the model to
// return the arguments of one tool, so the rest of the app doesn't care which
// provider is in use.

const PROVIDERS = {
  groq: {
    kind: 'openai',
    baseURL: 'https://api.groq.com/openai/v1',
    apiKeyEnv: 'GROQ_API_KEY',
    defaultModel: 'llama-3.3-70b-versatile'
  },
  ollama: {
    kind: 'openai',
    baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1',
    apiKeyEnv: null, // Ollama needs no key
    defaultModel: 'llama3.1'
  },
  openai: {
    kind: 'openai',
    baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    apiKeyEnv: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o-mini'
  },
  anthropic: {
    kind: 'anthropic',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    defaultModel: 'claude-sonnet-5'
  }
};

const providerName = (process.env.LLM_PROVIDER || 'groq').toLowerCase();
const provider = PROVIDERS[providerName];
if (!provider) {
  throw new Error(
    `Unknown LLM_PROVIDER "${providerName}". Use one of: ${Object.keys(PROVIDERS).join(', ')}`
  );
}

const model = process.env.LLM_MODEL || provider.defaultModel;

function requireKey() {
  if (!provider.apiKeyEnv) return null;
  const key = process.env[provider.apiKeyEnv];
  if (!key) {
    throw new Error(
      `Missing ${provider.apiKeyEnv} for LLM_PROVIDER=${providerName}. Set it in .env.`
    );
  }
  return key;
}

let clientPromise;
function getOpenAIClient() {
  if (!clientPromise) {
    clientPromise = import('openai').then(({ default: OpenAI }) => {
      return new OpenAI({ apiKey: requireKey() || 'not-needed', baseURL: provider.baseURL });
    });
  }
  return clientPromise;
}

let anthropicClient;
function getAnthropicClient() {
  if (!anthropicClient) {
    const Anthropic = require('@anthropic-ai/sdk');
    anthropicClient = new Anthropic({ apiKey: requireKey() });
  }
  return anthropicClient;
}

/**
 * Force the model to call `tool` and return its parsed arguments object.
 * @param {{ system: string, messages: {role:'user'|'assistant', content:string}[],
 *           tool: { name:string, description:string, parameters:object } }} args
 * @returns {Promise<object>} the tool's arguments
 */
async function callLLM({ system, messages, tool }) {
  if (provider.kind === 'anthropic') {
    return callAnthropic({ system, messages, tool });
  }
  return callOpenAICompatible({ system, messages, tool });
}

async function callOpenAICompatible({ system, messages, tool }) {
  const client = await getOpenAIClient();
  const res = await client.chat.completions.create({
    model,
    max_tokens: 400,
    messages: [{ role: 'system', content: system }, ...messages],
    tools: [{ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.parameters } }],
    tool_choice: { type: 'function', function: { name: tool.name } }
  });

  const call = res.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) throw new Error('LLM returned no tool call');
  return JSON.parse(call.function.arguments);
}

async function callAnthropic({ system, messages, tool }) {
  const client = getAnthropicClient();
  const res = await client.messages.create({
    model,
    max_tokens: 400,
    system,
    tools: [{ name: tool.name, description: tool.description, input_schema: tool.parameters }],
    tool_choice: { type: 'tool', name: tool.name },
    messages
  });

  const toolUse = res.content.find((b) => b.type === 'tool_use');
  if (!toolUse) throw new Error('LLM returned no tool call');
  return toolUse.input;
}

module.exports = { callLLM, providerName, model };
