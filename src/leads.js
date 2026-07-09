const fs = require('fs');
const path = require('path');

const LEADS_FILE = path.join(__dirname, '..', 'logs', 'leads.jsonl');

function saveLead(lead, callInfo) {
  fs.mkdirSync(path.dirname(LEADS_FILE), { recursive: true });
  const entry = { ...lead, ...callInfo, capturedAt: new Date().toISOString() };
  fs.appendFileSync(LEADS_FILE, JSON.stringify(entry) + '\n');
  return entry;
}

module.exports = { saveLead };
