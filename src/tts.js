// Text-to-speech. With TTS_PROVIDER=elevenlabs we synthesize an MP3 with
// ElevenLabs, cache it under public/audio, and return a public URL that
// Twilio can <Play>. Otherwise we return null and the caller falls back to
// Twilio's built-in <Say> voice.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const AUDIO_DIR = path.join(__dirname, '..', 'public', 'audio');
const PROVIDER = (process.env.TTS_PROVIDER || 'twilio').toLowerCase();
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'; // "Rachel"
const MODEL_ID = process.env.ELEVENLABS_MODEL || 'eleven_turbo_v2_5';
const MAX_AGE_MS = 60 * 60 * 1000; // clean up generated clips after 1 hour

function ttsEnabled() {
  return PROVIDER === 'elevenlabs' && !!process.env.ELEVENLABS_API_KEY;
}

function cleanupOldFiles() {
  try {
    const now = Date.now();
    for (const f of fs.readdirSync(AUDIO_DIR)) {
      const p = path.join(AUDIO_DIR, f);
      if (now - fs.statSync(p).mtimeMs > MAX_AGE_MS) fs.unlinkSync(p);
    }
  } catch {
    /* directory may not exist yet; ignore */
  }
}

/**
 * Synthesize speech and return a public URL Twilio can play, or null to
 * signal "use Twilio's built-in voice instead".
 * @param {string} text
 * @returns {Promise<string|null>}
 */
async function synthesize(text) {
  if (!ttsEnabled()) return null;

  // On Render, RENDER_EXTERNAL_URL is set automatically to the public URL.
  const baseUrl = process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL;
  if (!baseUrl) {
    console.warn('TTS: PUBLIC_BASE_URL not set — falling back to Twilio <Say>.');
    return null;
  }

  fs.mkdirSync(AUDIO_DIR, { recursive: true });

  // Cache by content hash so repeated lines (e.g. the greeting) are only
  // generated once, saving ElevenLabs credits and latency.
  const hash = crypto.createHash('sha1').update(`${VOICE_ID}:${MODEL_ID}:${text}`).digest('hex').slice(0, 16);
  const fileName = `${hash}.mp3`;
  const filePath = path.join(AUDIO_DIR, fileName);
  const publicUrl = `${baseUrl.replace(/\/$/, '')}/audio/${fileName}`;

  if (fs.existsSync(filePath)) return publicUrl;

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg'
      },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
      })
    });

    if (!res.ok) {
      console.error(`ElevenLabs TTS failed (${res.status}): ${await res.text()}`);
      return null; // fall back to Twilio <Say>
    }

    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(filePath, buf);
    cleanupOldFiles();
    return publicUrl;
  } catch (err) {
    console.error('ElevenLabs TTS error:', err.message);
    return null;
  }
}

module.exports = { synthesize, ttsEnabled, AUDIO_DIR };
