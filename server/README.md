# Contact form backend

Small Express server that serves the Sphynx guide's static site and handles
`POST /api/contact` by emailing the submission over SMTP.

## Setup

```bash
cd server
npm install
cp .env.example .env
```

Edit `.env` with your SMTP details. For a Gmail mailbox:

1. Turn on 2-Step Verification on the Google account.
2. Create an App Password at https://myaccount.google.com/apppasswords.
3. Use that 16-character password as `SMTP_PASS` (not your normal password).

## Run

```bash
npm start
```

Open http://localhost:3000 — this serves `index.html` and handles form
submissions in one process, so there's nothing else to configure.

## What it does

- Validates required fields (name, email, message) and the email format
  server-side, in addition to the browser's own validation.
- Rejects bot submissions via a hidden honeypot field (`website`) — a
  human never sees or fills it in, so a filled value means a bot.
- Rate-limits `/api/contact` to 5 requests per 10 minutes per IP.
- Sends as your own authenticated mailbox (`SMTP_USER`) with `replyTo` set
  to the visitor's address, so replying goes straight to them without
  risking SPF/DKIM failures from spoofing the "from" address.
- Sends plain text only (no HTML), so nothing a visitor types can inject
  markup or scripts into the email.
- Serves the static site itself and blocks `/server/*` so the source and
  `.env` are never reachable over HTTP.
