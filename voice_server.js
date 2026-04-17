// Sal AI Voice Server v1.0
// Real-time conversational AI: Twilio + ElevenLabs + Claude
// All secrets via environment variables — see README
// Deploy as new Render Web Service (Node, start: node voice_server.js)

const express = require('express');
const WebSocket = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const EL_KEY = process.env.ELEVENLABS_API_KEY;
const CLAUDE_KEY = process.env.ANTHROPIC_API_KEY;
const EL_VOICE = process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB';
const SB_URL = process.env.SUPABASE_URL || 'https://wzcuzyouymauokijaqjk.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const TG_BOT = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT = process.env.TELEGRAM_CHAT_ID;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.get('/', (req, res) => res.json({ status: 'Sal AI Voice Server running' }));
app.get('/health', (req, res) => res.json({ ok: true }));

app.post('/voice/answer', (req, res) => {
  const biz = req.query.biz || 'your business';
  const host = process.env.RENDER_EXTERNAL_HOSTNAME || req.headers.host;
  res.set('Content-Type', 'text/xml');
  res.send('<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="wss://' + host + '/voice/stream?biz=' + encodeURIComponent(biz) + '" /></Connect></Response>');
});

wss.on('connection', async (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const biz = decodeURIComponent(url.searchParams.get('biz') || 'your business');
  let streamSid = null, history = [], buf = Buffer.alloc(0);
  let speaking = false, timer = null, greeted = false;

  const sys = 'You are Sal from Sal AI calling ' + biz + '. Max 2-3 sentences per response. Sal AI: automated follow-ups, review management, customer reactivation. Goal: free 15-min demo. Natural speech. dealdily.com';

  async function tts(text) {
    if (!EL_KEY) return null;
    const r = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + EL_VOICE + '/stream', {
      method: 'POST', headers: { 'xi-api-key': EL_KEY, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: 'eleven_turbo_v2', voice_settings: { stability: 0.5, similarity_boost: 0.8 } })
    }).catch(() => null);
    if (!r || !r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  }

  async function claude(text) {
    if (!CLAUDE_KEY) return "Please visit dealdily.com to learn more.";
    history.push({ role: 'user', content: text });
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'x-api-key': CLAUDE_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 100, system: sys, messages: history })
    }).catch(() => null);
    if (!r) return "Could you repeat that?";
    const d = await r.json();
    const reply = d.content?.[0]?.text || "Could you say that again?";
    history.push({ role: 'assistant', content: reply });
    return reply;
  }

  function sendAudio(a) {
    if (ws.readyState === WebSocket.OPEN && streamSid)
      ws.send(JSON.stringify({ event: 'media', streamSid, media: { payload: a.toString('base64') } }));
  }

  async function greet() {
    if (greeted) return; greeted = true;
    const msg = 'Hi there, this is Sal from Sal AI. Is this the owner or manager of ' + biz + '?';
    history.push({ role: 'assistant', content: msg });
    const a = await tts(msg); if (a) sendAudio(a);
  }

  async function hotAlert() {
    if (!TG_BOT || !TG_CHAT) return;
    await fetch('https://api.telegram.org/bot' + TG_BOT + '/sendMessage', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text: '🔥 HOT LEAD on AI Voice Call!\nBusiness: ' + biz + '\n\nCall them back NOW!' })
    }).catch(() => {});
  }

  ws.on('message', async (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.event === 'start') { streamSid = msg.start.streamSid; setTimeout(greet, 800); }
    else if (msg.event === 'media') {
      buf = Buffer.concat([buf, Buffer.from(msg.media.payload, 'base64')]);
      clearTimeout(timer);
      timer = setTimeout(async () => {
        if (buf.length < 400 || speaking) { buf = Buffer.alloc(0); return; }
        const cap = buf; buf = Buffer.alloc(0); speaking = true;
        try {
          const DG = process.env.DEEPGRAM_API_KEY;
          let text = '';
          if (DG) {
            const tr = await fetch('https://api.deepgram.com/v1/listen?model=nova-2', {
              method: 'POST', headers: { 'Authorization': 'Token ' + DG, 'Content-Type': 'audio/mulaw;rate=8000' }, body: cap
            }).catch(() => null);
            if (tr) { const td = await tr.json(); text = td.results?.channels?.[0]?.alternatives?.[0]?.transcript || ''; }
          }
          if (!text || text.length < 3) return;
          if (/yes|interested|sure|demo|tell me/.test(text.toLowerCase())) hotAlert();
          const reply = await claude(text);
          const a = await tts(reply); if (a) sendAudio(a);
        } finally { speaking = false; }
      }, 700);
    }
  });
  ws.on('close', () => clearTimeout(timer));
});

server.listen(process.env.PORT || 3001, () => console.log('Sal AI Voice on port', process.env.PORT || 3001));