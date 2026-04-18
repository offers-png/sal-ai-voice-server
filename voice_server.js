const express = require('express');
const http = require('http');
const app = express();
const server = http.createServer(app);

const SB_URL = process.env.SUPABASE_URL || 'https://wzcuzyouymauokijaqjk.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const TG_BOT = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT = process.env.TELEGRAM_CHAT_ID;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => res.json({ status: 'Sal AI Voice Server running', version: '2.1.0' }));
app.get('/health', (req, res) => res.json({ ok: true, tgBot: !!TG_BOT, tgChat: !!TG_CHAT, sbKey: !!SB_KEY }));

async function sendTelegram(text) {
  if (!TG_BOT || !TG_CHAT) { console.error('[tg] MISSING env vars - TG_BOT:', !!TG_BOT, 'TG_CHAT:', !!TG_CHAT); return false; }
  const r = await fetch('https://api.telegram.org/bot' + TG_BOT + '/sendMessage', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TG_CHAT, parse_mode: 'Markdown', text })
  });
  const d = await r.json();
  console.log('[tg]', d.ok ? 'sent ok' : 'FAILED: ' + JSON.stringify(d));
  return d.ok;
}

app.post('/voice/answer', (req, res) => {
  const biz = decodeURIComponent(req.query.biz || req.body.To || 'your business').replace(/[<>&"']/g, '');
  const callSid = req.body.CallSid || '';
  const host = process.env.RENDER_EXTERNAL_HOSTNAME || 'sal-ai-voice-server.onrender.com';
  console.log('[inbound] callSid:', callSid, 'biz:', biz);
  res.set('Content-Type', 'text/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Matthew-Neural" language="en-US">Hi there, this is Sal from Sal AI. We help local businesses with automated follow-ups, review management, and customer reactivation. You can learn more at deal daily dot com. If you would like a free 15 minute walkthrough, press 1 now and someone will call you back personally. To be removed from our list, press 2. Or simply hang up, no problem at all. Thank you for your time.</Say><Gather numDigits="1" action="https://${host}/voice/keypress" method="POST" timeout="8"></Gather><Say voice="Polly.Matthew-Neural">Have a great day!</Say></Response>`);
});

app.post('/voice/keypress', async (req, res) => {
  const digit = req.body.Digits || '';
  const from = req.body.From || '';
  const callSid = req.body.CallSid || '';
  console.log('[keypress] digit:', digit, 'from:', from);
  if (digit === '1') {
    await sendTelegram('\u{1F525} *HOT LEAD pressed 1!*\n\nPhone: ' + from + '\nCall SID: ' + callSid + '\n\nCall them back NOW \u2014 they want a demo!\ndealdily.com');
    if (SB_KEY) {
      const digits = from.replace(/\D/g,'').slice(-10);
      fetch(SB_URL + '/rest/v1/saleh2_leads?phone=like.*' + digits + '*', {
        method: 'PATCH', headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'interested', call_outcome: 'interested' })
      }).catch(e => console.error('[sb]', e.message));
    }
    res.set('Content-Type', 'text/xml');
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Matthew-Neural">Perfect! Someone from Sal AI will call you back personally within 15 minutes. Thank you and have a great day!</Say></Response>');
  } else {
    res.set('Content-Type', 'text/xml');
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Matthew-Neural">You have been removed from our list. We apologize for the interruption. Have a wonderful day!</Say></Response>');
  }
});

app.post('/call-status', (req, res) => {
  const status = req.body.CallStatus || '';
  const to = (req.body.To || '').replace(/\D/g,'').slice(-10);
  const duration = req.body.CallDuration || '0';
  console.log('[call-status]', status, 'to:', to, 'duration:', duration + 's');
  if (SB_KEY && to) {
    const map = { completed: 'answered', 'no-answer': 'no_answer', busy: 'busy', failed: 'failed' };
    fetch(SB_URL + '/rest/v1/saleh2_leads?phone=like.*' + to + '*', {
      method: 'PATCH', headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ call_outcome: map[status] || status, call_notes: 'Duration: ' + duration + 's' })
    }).catch(() => {});
  }
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log('[startup] v2.1 on port', PORT);
  console.log('[startup] TG_BOT:', !!TG_BOT, 'TG_CHAT:', !!TG_CHAT, 'SB_KEY:', !!SB_KEY);
});