require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');

const PORT = process.env.PORT || 3000;
const PROJECT_ROOT = path.join(__dirname, '..');

const REQUIRED_ENV = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'CONTACT_TO'];
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingEnv.length) {
  console.error(`Missing required environment variables: ${missingEnv.join(', ')}`);
  console.error('Copy server/.env.example to server/.env and fill in your SMTP details.');
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const app = express();
app.disable('x-powered-by');
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

  try {
    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: process.env.CONTACT_TO,
      replyTo: `${name} <${email}>`,
      subject: `Sphynx guide contact form — ${name}`,
      text: lines.join('\n'),
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error('Failed to send contact email:', err);
    return res.status(502).json({ ok: false, error: 'Could not send your message. Please try again later.' });
  }
});

// Keep server source and secrets out of the static file tree it serves.
app.use('/server', (req, res) => res.status(404).end());

app.use(express.static(PROJECT_ROOT, { dotfiles: 'deny', index: 'index.html' }));

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
