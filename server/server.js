const path = require('path');

// Local dev keeps its secrets in server/.env; resolve it relative to this
// file so `npm start` works from the repo root. In production (Railway)
// there is no .env file and the platform supplies these as real env vars,
// so this call simply finds nothing and falls through.
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const { createMailer, bilingual, bilingualSubject } = require('./mail');

const PORT = process.env.PORT || 3000;
const PROJECT_ROOT = path.join(__dirname, '..');

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

const mailer = createMailer({
  apiKey: process.env.RESEND_API_KEY,
  from: process.env.MAIL_FROM,
});

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

// Hardening headers. The CSP still needs 'unsafe-inline' because the pages
// carry inline <style>/<script> blocks; it nonetheless pins where scripts,
// connections and form posts may go, and forbids framing entirely.
const SUPABASE_ORIGIN = new URL(process.env.SUPABASE_URL).origin;
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  // api.pwnedpasswords.com receives only the first 5 characters of a
  // password's SHA-1 hash (k-anonymity), never the password itself.
  `connect-src 'self' ${SUPABASE_ORIGIN} https://api.pwnedpasswords.com`,
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  // Only meaningful over TLS, and Railway terminates TLS for us. No
  // `preload` — that is effectively irreversible once submitted.
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  }
  next();
});

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

// An RFC 5322 display-name must be quoted, and cannot contain a bare < or >.
// Interpolating a raw name produced addresses like `<script>x</script>
// <a@b.com>`, which the mail API rejects — so any visitor whose name held an
// angle bracket silently lost their message. Quote it and drop the
// characters that break the grammar even inside quotes.
function formatReplyTo(name, email) {
  const display = name.replace(/[\\"<>]/g, '').trim();
  return display ? `"${display}" <${email}>` : email;
}

// Used only to link to the privacy notice from the confirmation email.
// Deliberately NOT derived from the request's Host header: that is
// attacker-controlled, and a link in an email we send to a visitor is
// exactly where a spoofed host would do damage. Empty means the line is
// simply left out.
const SITE_URL = process.env.SITE_URL || process.env.ALLOWED_ORIGIN || '';

// Confirms to the visitor that the message arrived, and gives them the copy
// they would otherwise have no record of — the form clears on submit.
//
// This does mean the endpoint delivers visitor-typed text to a
// visitor-supplied address, which is a modest abuse vector. The honeypot
// and the 5-per-10-minutes rate limit are the controls; the sender is
// unambiguously the site, and replies route back to CONTACT_TO rather than
// to whoever filled the form in.
function autoreplyBody(lang, name, message, behaviourist) {
  const privacy = SITE_URL ? `${SITE_URL}/privacy.html` : '';
  if (lang === 'pl') {
    return [
      // No name in the Polish greeting. Polish would need the vocative
      // ("Panie Janie"), which cannot be derived from a free-text field —
      // and a nominative full name after "Dzień dobry" reads like a form
      // letter from an office. A bare greeting is simply correct.
      'Dzień dobry,',
      '',
      'dziękujemy za wiadomość wysłaną przez sphynx.guide. To automatyczne potwierdzenie, że Twoje zapytanie do nas dotarło — nie musisz nic robić.',
      '',
      'Zazwyczaj odpowiadamy w ciągu 2 dni roboczych.',
      behaviourist
        ? '\nZaznaczono prośbę o konsultację behawiorystyczną, więc w odpowiedzi znajdziesz też informacje o przebiegu konsultacji i dostępnych terminach.'
        : null,
      '',
      'Treść Twojej wiadomości:',
      '',
      message,
      '',
      'Jeśli chcesz coś dodać, po prostu odpowiedz na tego e-maila.',
      privacy ? `\nTwoje dane wykorzystujemy wyłącznie do odpowiedzi na to zapytanie i przechowujemy je na terenie UE: ${privacy}` : null,
    ].filter((line) => line !== null).join('\n');
  }
  return [
    `Hello ${name},`,
    '',
    'Thank you for your message via sphynx.guide. This is an automatic confirmation that your enquiry reached us — there is nothing you need to do.',
    '',
    'We typically reply within 2 business days.',
    behaviourist
      ? '\nYou asked about a behaviourist consultation, so the reply will also cover how a session works and which times are free.'
      : null,
    '',
    'What you sent:',
    '',
    message,
    '',
    'If you would like to add anything, just reply to this email.',
    privacy ? `\nYour details are used only to answer this enquiry and are stored in the EU: ${privacy}` : null,
  ].filter((line) => line !== null).join('\n');
}

// Per-recipient throttle for the confirmation email.
//
// contactLimiter caps how fast one IP can post, which does nothing about the
// abuse this endpoint actually enables: both the recipient AND the message
// body are chosen by whoever fills the form, so it can deliver arbitrary text
// to anyone, from a DKIM-signed address this practice owns. Rotating IPs
// defeats a per-IP limit outright; capping per RECIPIENT is what bounds how
// much any one person can be made to receive.
//
// Deliberately does not block the submission or the notification to the
// behaviourist. A genuine second enquiry from the same person within the hour
// is normal and must still reach her; only their duplicate confirmation is
// skipped.
//
// Held in memory, so it resets on redeploy and is per-instance. The service
// runs a single replica, which makes that fine. If it is ever scaled out this
// needs to move to the database, where contact_submissions already records
// email and created_at.
const AUTOREPLY_WINDOW_MS = 60 * 60 * 1000;
// Bounds memory if someone floods the form with unique addresses.
const AUTOREPLY_MAX_TRACKED = 5000;
const autoreplySentAt = new Map();

function mayAutoreply(email) {
  const key = email.toLowerCase();
  const now = Date.now();
  const last = autoreplySentAt.get(key);
  if (last !== undefined && now - last < AUTOREPLY_WINDOW_MS) return false;

  if (autoreplySentAt.size >= AUTOREPLY_MAX_TRACKED) {
    for (const [addr, sentAt] of autoreplySentAt) {
      if (now - sentAt >= AUTOREPLY_WINDOW_MS) autoreplySentAt.delete(addr);
    }
    // Still full of live entries: drop the least recent so a flood of unique
    // addresses cannot pin the map and lock everyone else out.
    if (autoreplySentAt.size >= AUTOREPLY_MAX_TRACKED) {
      const oldest = autoreplySentAt.keys().next().value;
      if (oldest !== undefined) autoreplySentAt.delete(oldest);
    }
  }

  // delete-then-set so insertion order tracks recency, which is what makes
  // the eviction above evict the right entry.
  autoreplySentAt.delete(key);
  autoreplySentAt.set(key, now);
  return true;
}

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
  // Anything other than the one language we have copy for falls back to
  // English, rather than being interpolated anywhere.
  const lang = body.lang === 'pl' ? 'pl' : 'en';

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

  const mailed = mailer.send({
    to: process.env.CONTACT_TO,
    replyTo: formatReplyTo(name, email),
    subject: `Sphynx guide contact form — ${name}`,
    text: lines.join('\n'),
  });

  // Non-critical by design: if the visitor's copy fails, their message has
  // still reached the behaviourist, and telling them it failed would be a
  // lie. Sent concurrently so it costs the visitor no extra waiting.
  //
  // Recorded as sent before the attempt rather than after. The cost is that a
  // genuine resubmission gets no second confirmation if the first send failed;
  // the alternative is that a failing send lets an attacker retry freely,
  // which is the case this limit exists for.
  let acknowledged = Promise.resolve(null);
  if (mayAutoreply(email)) {
    acknowledged = mailer.sendNonCritical({
      to: email,
      replyTo: process.env.CONTACT_TO,
      subject: lang === 'pl'
        ? 'Otrzymaliśmy Twoją wiadomość — Przewodnik po Sfinksie'
        : "We've received your message — Canadian Sphynx Guide",
      text: autoreplyBody(lang, name, message, behaviourist),
    }, `autoreply to ${email}`);
  } else {
    // Worth a line in the logs: a burst of these is what abuse looks like.
    console.warn(`Autoreply skipped, already sent within the hour: ${email}`);
  }

  const [, mailError] = await Promise.all([saved, mailed, acknowledged]);
  if (mailError) {
    console.error('Failed to send contact email:', mailError.message || mailError);
    return res.status(502).json({ ok: false, error: 'Could not send your message. Please try again later.' });
  }
  return res.json({ ok: true });
});

// ---------- appointment notifications ----------

// The practice runs on Warsaw time; profile.html pins the same zone when it
// renders these. A client abroad reading "18:00" with no zone would simply
// miss the session.
const PRACTICE_TZ = 'Europe/Warsaw';

// 'no_show' is absent on purpose: that is bookkeeping about a session that
// already failed to happen, and mailing someone about it would be a
// reproach rather than information.
const APPOINTMENT_EVENTS = ['created', 'cancelled', 'reinstated'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MODE_LABELS = {
  online: { en: 'Online', pl: 'Online' },
  in_person: { en: 'In person', pl: 'Stacjonarnie' },
};

function formatWhen(iso, locale) {
  return new Date(iso).toLocaleString(locale, {
    dateStyle: 'full', timeStyle: 'short', timeZone: PRACTICE_TZ,
  });
}

// Both languages in one message. profiles has no language column, and for
// something as consequential as "your session has moved" a wrong guess is
// far worse than a long email.
function appointmentEmail(event, appointment) {
  const profileUrl = SITE_URL ? `${SITE_URL}/profile.html` : '';
  const detail = (locale, lang) => {
    const lines = [
      `  ${lang === 'pl' ? 'Termin' : 'When'}: ${formatWhen(appointment.scheduled_at, locale)} (${lang === 'pl' ? 'czas warszawski' : 'Warsaw time'})`,
      `  ${lang === 'pl' ? 'Czas trwania' : 'Duration'}: ${appointment.duration_minutes} min`,
      `  ${lang === 'pl' ? 'Forma' : 'Format'}: ${MODE_LABELS[appointment.mode][lang]}`,
    ];
    if (appointment.location) {
      // The column holds a meeting URL for an online session and a street
      // address for one in person, so the label follows the mode rather
      // than offering both and letting the reader work it out.
      const label = appointment.mode === 'online'
        ? (lang === 'pl' ? 'Link' : 'Link')
        : (lang === 'pl' ? 'Adres' : 'Address');
      lines.push(`  ${label}: ${appointment.location}`);
    }
    return lines.join('\n');
  };

  const en = (opening, closing) => [
    'Hello,', '', opening, '', detail('en-GB', 'en'),
    appointment.notes ? `\nHow to prepare:\n${appointment.notes}` : null,
    profileUrl ? `\nYou can always see your appointments here: ${profileUrl}` : null,
    '', closing,
  ].filter((line) => line !== null).join('\n');

  const pl = (opening, closing) => [
    'Dzień dobry,', '', opening, '', detail('pl-PL', 'pl'),
    appointment.notes ? `\nJak się przygotować:\n${appointment.notes}` : null,
    profileUrl ? `\nSwoje wizyty zobaczysz zawsze tutaj: ${profileUrl}` : null,
    '', closing,
  ].filter((line) => line !== null).join('\n');

  if (event === 'cancelled') {
    return {
      subject: bilingualSubject('Appointment cancelled', 'Wizyta odwołana'),
      text: bilingual(
        // Not "if this does not suit you" — it is already off. The only
        // useful next step is booking another one.
        en('This consultation has been cancelled and will not take place:',
          'To arrange another time, just reply to this email.'),
        pl('Ta konsultacja została odwołana i się nie odbędzie:',
          'Aby umówić nowy termin, po prostu odpowiedz na tego e-maila.')
      ),
    };
  }
  if (event === 'reinstated') {
    return {
      subject: bilingualSubject('Appointment back on', 'Wizyta znów aktualna'),
      text: bilingual(
        en('Good news — this consultation is going ahead after all:',
          'If this no longer suits you, just reply to this email.'),
        pl('Dobra wiadomość — ta konsultacja jednak się odbędzie:',
          'Jeśli ten termin już Ci nie odpowiada, po prostu odpowiedz na tego e-maila.')
      ),
    };
  }
  return {
    subject: bilingualSubject('Appointment confirmed', 'Wizyta potwierdzona'),
    text: bilingual(
      en('Your consultation is booked:',
        'If this does not suit you, just reply to this email.'),
      pl('Twoja konsultacja została zaplanowana:',
        'Jeśli termin Ci nie odpowiada, po prostu odpowiedz na tego e-maila.')
    ),
  };
}

// Far looser than the contact limiter: the caller is an authenticated
// behaviourist doing her own admin, not an anonymous visitor.
const notifyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests. Please try again later.' },
});

app.options('/api/notify/appointment', cors(corsOptions));

// Appointments are written from the browser straight to Supabase under RLS,
// but the Resend key lives here and must stay here. So the browser asks this
// endpoint to do the telling.
//
// The request carries ONLY an appointment id. Every other fact — who the
// client is, their address, when the session is — is read here from the
// database. A caller therefore cannot dictate who gets told what, which is
// the whole security property of this endpoint: the worst a stolen
// behaviourist token can do is re-send a genuine notification to the
// genuine client.
async function handleAppointmentNotification(req, res) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    return res.status(401).json({ ok: false, error: 'Not signed in.' });
  }

  // Validates the JWT against the auth server rather than merely decoding
  // it — an unverified decode would accept anything a caller cared to type.
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData || !userData.user) {
    return res.status(401).json({ ok: false, error: 'Not signed in.' });
  }

  // Role comes from the database, never from the token's claims.
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', userData.user.id).single();
  if (!profile || profile.role !== 'behaviourist') {
    return res.status(403).json({ ok: false, error: 'Not allowed.' });
  }

  const body = req.body || {};
  const event = String(body.event || '');
  const appointmentId = String(body.appointment_id || '');
  if (!APPOINTMENT_EVENTS.includes(event) || !UUID_RE.test(appointmentId)) {
    return res.status(400).json({ ok: false, error: 'Invalid request.' });
  }

  const { data: appointment } = await supabase
    .from('appointments').select('*').eq('id', appointmentId).single();
  if (!appointment) {
    return res.status(404).json({ ok: false, error: 'Appointment not found.' });
  }

  // Nothing useful to say about a session that has already been and gone,
  // and "your appointment is cancelled" about last Tuesday reads as a
  // mistake. Not an error — the status change itself succeeded.
  if (new Date(appointment.scheduled_at).getTime() < Date.now()) {
    return res.json({ ok: true, sent: false, reason: 'past' });
  }

  const { data: owner } = await supabase
    .from('profiles').select('email').eq('id', appointment.owner_id).single();
  if (!owner || !owner.email) {
    return res.json({ ok: true, sent: false, reason: 'no_email' });
  }

  const { subject, text } = appointmentEmail(event, appointment);
  const mailError = await mailer.send({
    to: owner.email,
    replyTo: process.env.CONTACT_TO,
    subject,
    text,
  });
  if (mailError) {
    console.error('Failed to send appointment notification:', mailError.message || mailError);
    return res.status(502).json({ ok: false, error: 'Could not email the client.' });
  }
  return res.json({ ok: true, sent: true });
}

// Express 4 does not forward a rejected promise from an async handler to the
// error middleware. Without this catch, a Supabase call that rejects — the
// project unreachable, DNS momentarily gone — would leave the request hanging
// with no response at all, which the browser cannot tell apart from a slow
// network. Answering 502 lets profile.html say the email did not go out.
app.post('/api/notify/appointment', cors(corsOptions), notifyLimiter, (req, res) => {
  handleAppointmentNotification(req, res).catch((err) => {
    console.error('Appointment notification failed:', err && err.message ? err.message : err);
    if (!res.headersSent) {
      res.status(502).json({ ok: false, error: 'Could not email the client.' });
    }
  });
});

// Serve only what the site actually needs, rather than exposing the repo
// root and carving exceptions out of it. Anything new at the root (sql/,
// scripts/, notes) is private by default because it was never mounted.
const staticOptions = { dotfiles: 'deny' };
for (const page of ['index.html', 'login.html', 'profile.html', 'privacy.html']) {
  app.get(`/${page}`, (req, res) => res.sendFile(path.join(PROJECT_ROOT, page)));
}
app.get('/', (req, res) => res.sendFile(path.join(PROJECT_ROOT, 'index.html')));
app.use('/js', express.static(path.join(PROJECT_ROOT, 'js'), staticOptions));
app.use('/images', express.static(path.join(PROJECT_ROOT, 'images'), staticOptions));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ ok: false, error: 'Invalid request body.' });
  }
  // Oversized bodies are a client error; returning 500 wrongly implied the
  // server had broken.
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ ok: false, error: 'Your message is too long.' });
  }
  console.error(err);
  res.status(500).json({ ok: false, error: 'Unexpected server error.' });
});

app.listen(PORT, () => {
  console.log(`Sphynx guide server running at http://localhost:${PORT}`);
});
