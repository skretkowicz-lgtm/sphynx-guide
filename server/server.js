const path = require('path');

// Local dev keeps its secrets in server/.env; resolve it relative to this
// file so `npm start` works from the repo root. In production (Railway)
// there is no .env file and the platform supplies these as real env vars,
// so this call simply finds nothing and falls through.
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { Resend } = require('resend');
const { createClient } = require('@supabase/supabase-js');

const PORT = process.env.PORT || 3000;
const PROJECT_ROOT = path.join(__dirname, '..');

// Mail goes out over Resend's HTTPS API rather than SMTP. Railway (like
// most hosts) blocks outbound SMTP ports to deter spam, so a direct
// smtp.gmail.com connection hangs until it times out. Port 443 always
// works, and using the same path locally keeps dev and prod identical.
const REQUIRED_ENV = [
  'RESEND_API_KEY', 'MAIL_FROM', 'CONTACT_TO',
  'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY',
];
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingEnv.length) {
  console.error(`Missing required environment variables: ${missingEnv.join(', ')}`);
  console.error('Copy server/.env.example to server/.env and fill in your Resend and Supabase details.');
  process.exit(1);
}

const resend = new Resend(process.env.RESEND_API_KEY);

// Service-role key — full table access, bypasses Row Level Security. Only
// ever used here, server-side. Never send this key to the browser.
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const app = express();
app.disable('x-powered-by');

// Railway (and most hosts) put the app behind a reverse proxy, so the
// socket address is the proxy's. Trusting one hop lets express-rate-limit
// key on the real client IP via X-Forwarded-For — without this, every
// visitor shares a single bucket and one person can rate-limit everyone.
// Only enabled in production: trusting the header locally would let a
// client spoof its own IP and bypass the limiter.
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(express.json({ limit: '20kb' }));

const corsOptions = {
  origin: process.env.ALLOWED_ORIGIN || true,
  methods: ['POST'],
};

const contactLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests. Please try again later.' },
});

function stripControlChars(value) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.options('/api/contact', cors(corsOptions));

app.post('/api/contact', cors(corsOptions), contactLimiter, async (req, res) => {
  const body = req.body || {};

  // Honeypot: a field real visitors never see or fill in. Bots that fill
  // every field trip this, and we quietly pretend to succeed.
  if (stripControlChars(body.website)) {
    return res.json({ ok: true });
  }

  const name = stripControlChars(body.name).slice(0, 100);
  const email = stripControlChars(body.email).slice(0, 200);
  const phone = stripControlChars(body.phone).slice(0, 30);
  const message = String(body.message || '').slice(0, 2000).trim();
  const behaviourist = body.behaviourist === true || body.behaviourist === 'yes';

  if (!name || !email || !message) {
    return res.status(400).json({ ok: false, error: 'Name, email, and message are required.' });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ ok: false, error: 'Please provide a valid email address.' });
  }

  const lines = [
    `Name: ${name}`,
    `Email: ${email}`,
    phone ? `Phone: ${phone}` : null,
    `Behaviourist consultation requested: ${behaviourist ? 'Yes' : 'No'}`,
    '',
    'Message:',
    message,
  ].filter((line) => line !== null);

  // The insert and the email don't depend on each other, so run them
  // concurrently rather than making the visitor wait for both in series.
  // A DB failure is logged but never blocks the reply; only a mail failure
  // is reported back, which matches how this behaved when it was serial.
  const saved = supabase.from('contact_submissions')
    .insert({ name, email, phone: phone || null, behaviourist, message })
    .then(({ error }) => {
      if (error) console.error('Failed to save submission to Supabase:', error.message);
    }, (err) => {
      console.error('Supabase insert threw:', err.message);
    });

  // Resend reports failures as { error } rather than by rejecting, so
  // normalise both shapes into one value the caller can check.
  const mailed = resend.emails.send({
    from: process.env.MAIL_FROM,
    to: process.env.CONTACT_TO,
    replyTo: `${name} <${email}>`,
    subject: `Sphynx guide contact form — ${name}`,
    text: lines.join('\n'),
  }).then(({ error }) => error || null, (err) => err);

  const [, mailError] = await Promise.all([saved, mailed]);
  if (mailError) {
    console.error('Failed to send contact email:', mailError.message || mailError);
    return res.status(502).json({ ok: false, error: 'Could not send your message. Please try again later.' });
  }
  return res.json({ ok: true });
});

// Serve only what the site actually needs, rather than exposing the repo
// root and carving exceptions out of it. Anything new at the root (sql/,
// scripts/, notes) is private by default because it was never mounted.
const staticOptions = { dotfiles: 'deny' };
for (const page of ['index.html', 'login.html', 'profile.html']) {
  app.get(`/${page}`, (req, res) => res.sendFile(path.join(PROJECT_ROOT, page)));
}
app.get('/', (req, res) => res.sendFile(path.join(PROJECT_ROOT, 'index.html')));
app.use('/js', express.static(path.join(PROJECT_ROOT, 'js'), staticOptions));
app.use('/images', express.static(path.join(PROJECT_ROOT, 'images'), staticOptions));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ ok: false, error: 'Invalid request body.' });
  }
  console.error(err);
  res.status(500).json({ ok: false, error: 'Unexpected server error.' });
});

app.listen(PORT, () => {
  console.log(`Sphynx guide server running at http://localhost:${PORT}`);
});
