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

app.get('/', (req, res) => res.json({ status: 'Sal AI Voice Server running', version: '2.0.0' }));
app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// Twilio webhook for inbound calls - returns TwiML with <Say> greeting + <Gather> for keypress
// This works for BOTH inbound and outbound calls
app.post('/voice/answer', (req, res) => {
  const biz = req.query.biz || req.body.To || 'your business';
  const bizClean = decodeURIComponent(biz).replace(/[<>&"']/g, '');
  const callSid = req.body.CallSid || '';
  const host = process.env.RENDER_EXTERNAL_HOSTNAME || 'sal-ai-voice-server.onrender.com';
  
  console.log('[inbound] callSid:', callSid, 'biz:', bizClean, 'host:', host);

  res.set('Content-Type', 'text/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Matthew-Neural" language="en-US">
    Hi there, this is Sal from Sal AI. We help local businesses with automated follow-ups, review management, and customer reactivation. You can learn more at deal daily dot com. If you would like a free 15 minute walkthrough, press 1 now and someone will call you back personally. To be removed from our list, press 2. Or simply hang up, no problem at all. Thank you for your time.
  </Say>
  <Gather numDigits="1" action="https://${host}/voice/keypress" method="POST" timeout="8">
  </Gather>
  <Say voice="Polly.Matthew-Neural">Have a great day!</Say>
</Response>`);
});

// Handle keypress responses
app.post('/voice/keypress', (req, res) => {
  const digit = req.body.Digits || '';
  const from = req.body.From || '';
  const callSid = req.body.CallSid || '';
  
  console.log('[keypress] digit:', digit, 'from:', from);

  // Alert Saleh on Telegram for press 1
  if (digit === '1' && TG_BOT && TG_CHAT) {
    fetch(`https://api.telegram.org/bot${TG_BOT}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TG_CHAT,
        text: `🔥 HOT LEAD pressed 1!\n\nPhone: ${from}\nCall SID: ${callSid}\n\nCALL THEM BACK NOW — they want a demo!`
      })
    }).catch(() => {});
  }

  // Mark as opted out for press 2
  if (digit === '2' && SB_KEY) {
    const digits = from.replace(/\D/g,'').slice(-10);
    fetch(`${SB_URL}/rest/v1/saleh2_leads?phone=like.*${digits}*`, {
      method: 'PATCH',
      headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'opted_out', call_outcome: 'opted_out' })
    }).catch(() => {});
  }

  res.set('Content-Type', 'text/xml');
  if (digit === '1') {
    res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Matthew-Neural">Perfect! Someone from Sal AI will call you back personally within 15 minutes. Thank you and have a great day!</Say></Response>`);
  } else {
    res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Matthew-Neural">You have been removed from our list. We apologize for the interruption. Have a wonderful day!</Say></Response>`);
  }
});

// Handle call status callbacks
app.post('/call-status', (req, res) => {
  const status = req.body.CallStatus || '';
  const to = req.body.To || '';
  const duration = req.body.CallDuration || '0';
  const callSid = req.body.CallSid || '';
  console.log('[call-status]', callSid, status, to, duration + 's');

  // Update lead in Supabase
  if (SB_KEY && to) {
    const digits = to.replace(/\D/g,'').slice(-10);
    const outcomes = { completed: 'answered', 'no-answer': 'no_answer', busy: 'busy', failed: 'failed' };
    const outcome = outcomes[status] || status;
    fetch(`${SB_URL}/rest/v1/saleh2_leads?phone=like.*${digits}*`, {
      method: 'PATCH',
      headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ call_outcome: outcome, call_notes: 'Duration: ' + duration + 's | SID: ' + callSid })
    }).catch(() => {});
  }
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log('[startup] Sal AI Voice Server v2.0 on port', PORT);
  if (!EL_KEY) console.warn('[startup] WARNING: ELEVENLABS_API_KEY not set');
  if (!CLAUDE_KEY) console.warn('[startup] WARNING: ANTHROPIC_API_KEY not set');
});