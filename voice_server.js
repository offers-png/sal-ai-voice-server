const express = require('express');
const http = require('http');
const app = express();
const server = http.createServer(app);

const EL_KEY = process.env.ELEVENLABS_API_KEY;
const CLAUDE_KEY = process.env.ANTHROPIC_API_KEY;
const SB_URL = process.env.SUPABASE_URL || 'https://wzcuzyouymauokijaqjk.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const TG_BOT = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT = process.env.TELEGRAM_CHAT_ID;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => res.json({ status: 'Sal AI Voice Server running', version: '2.1.0' }));
app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now(), tgBot: !!TG_BOT, tgChat: !!TG_CHAT }));

async function sendTelegram(text) {
  const bot = TG_BOT;
  const chat = TG_CHAT;
  if (!bot || !chat) {
    console.error('[telegram] ERROR: TG_BOT or TG_CHAT not set. bot:', !!bot, 'chat:', !!chat);
    return;
  }
  try {
    const r = await fetch(`https://api.telegram.org/bot${bot}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, parse_mode: 'Markdown', text })
    });
    const d = await r.json();
    if (!d.ok) console.error('[telegram] API error:', JSON.stringify(d));
    else console.log('[telegram] sent ok');
  } catch(e) {
    console.error('[telegram] fetch error:', e.message);
  }
}

app.post('/voice/answer', (req, res) => {
  const biz = req.query.biz || req.body.To || 'your business';
  const bizClean = decodeURIComponent(biz).replace(/[<>&"']/g, '');
  const callSid = req.body.CallSid || '';
  const host = process.env.RENDER_EXTERNAL_HOSTNAME || 'sal-ai-voice-server.onrender.com';
  console.log('[inbound] callSid:', callSid, 'biz:', bizClean);

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

app.post('/voice/keypress', async (req, res) => {
  const digit = req.body.Digits || '';
  const from = req.body.From || '';
  const callSid = req.body.CallSid || '';
  console.log('[keypress] digit:', digit, 'from:', from, 'callSid:', callSid);

  if (digit === '1') {
    await sendTelegram(`🔥 *HOT LEAD pressed 1!*\n\nPhone: ${from}\nCall SID: ${callSid}\n\nCall them back NOW — they want a demo!\nSal AI: dealdily.com`);
    if (SB_KEY) {
      const digits = from.replace(/\D/g,'').slice(-10);
      fetch(`${SB_URL}/rest/v1/saleh2_leads?phone=like.*${digits}*`, {
        method: 'PATCH',
        headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'interested', call_outcome: 'interested', tag: 'pressed_1_demo' })
      }).catch(e => console.error('[supabase] error:', e.message));
    }
    res.set('Content-Type', 'text/xml');
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Matthew-Neural">Perfect! Someone from Sal AI will call you back personally within 15 minutes. Thank you and have a great day!</Say></Response>');
  } else {
    if (SB_KEY) {
      const digits = from.replace(/\D/g,'').slice(-10);
      fetch(`${SB_URL}/rest/v1/saleh2_leads?phone=like.*${digits}*`, {
        method: 'PATCH',
        headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'opted_out', call_outcome: 'opted_out' })
      }).catch(e => console.error('[supabase] error:', e.message));
    }
    res.set('Content-Type', 'text/xml');
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Matthew-Neural">You have been removed from our list. We apologize for the interruption. Have a wonderful day!</Say></Response>');
  }
});

app.post('/call-status', (req, res) => {
  const status = req.body.CallStatus || '';
  const to = (req.body.To || '').replace(/\D/g,'').slice(-10);
  const duration = req.body.CallDuration || '0';
  const callSid = req.body.CallSid || '';
  console.log('[call-status]', callSid, status, 'duration:', duration + 's');
  if (SB_KEY && to) {
    const outcomes = { completed: 'answered', 'no-answer': 'no_answer', busy: 'busy', failed: 'failed' };
    fetch(`${SB_URL}/rest/v1/saleh2_leads?phone=like.*${to}*`, {
      method: 'PATCH',
      headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ call_outcome: outcomes[status] || status, call_notes: 'Duration: ' + duration + 's | SID: ' + callSid })
    }).catch(e => console.error('[supabase] call-status error:', e.message));
  }
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log('[startup] Sal AI Voice Server v2.1 on port', PORT);
  console.log('[startup] TG_BOT set:', !!TG_BOT, '| TG_CHAT set:', !!TG_CHAT);
  console.log('[startup] EL_KEY set:', !!EL_KEY, '| SB_KEY set:', !!SB_KEY);
});