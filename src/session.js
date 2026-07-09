const sessions = new Map();

// In-memory only: fine for a single-process demo/MVP. For production with
// multiple server instances, swap this for Redis or another shared store
// keyed by CallSid.
function getSession(callSid) {
  if (!sessions.has(callSid)) {
    sessions.set(callSid, { history: [], retries: 0, callerNumber: null });
  }
  return sessions.get(callSid);
}

function endSession(callSid) {
  sessions.delete(callSid);
}

module.exports = { getSession, endSession };
