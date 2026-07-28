# Contact form backend

Small Express server that serves the Sphynx guide's static site and handles
`POST /api/contact` by saving the submission to Supabase and emailing it
over SMTP.

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

### Supabase (submission storage)

1. Create a free project at https://supabase.com/dashboard.
2. Open the SQL Editor for that project and run:

   ```sql
   create table if not exists contact_submissions (
     id uuid primary key default gen_random_uuid(),
     created_at timestamptz not null default now(),
     name text not null,
     email text not null,
     phone text,
     behaviourist boolean not null default false,
     message text not null
   );

   alter table contact_submissions enable row level security;
   -- No policies are added on purpose: with RLS on and zero policies, the
   -- table is unreachable via the public "anon" key. Only the server-side
   -- service_role key (which bypasses RLS) can read or write it.
   ```

3. Go to Project Settings → API and copy the **Project URL** into
   `SUPABASE_URL`, and the **service_role** secret key (not the "anon"
   public key) into `SUPABASE_SERVICE_ROLE_KEY`.

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
  human never sees or fills it in, so a filled value means a bot. Honeypot
  hits are never saved to Supabase or emailed.
- Rate-limits `/api/contact` to 5 requests per 10 minutes per IP.
- Saves every valid submission to the `contact_submissions` table in
  Supabase, using the service_role key (server-side only, bypasses RLS). A
  Supabase failure is logged but doesn't block the email from sending.
- Sends as your own authenticated mailbox (`SMTP_USER`) with `replyTo` set
  to the visitor's address, so replying goes straight to them without
  risking SPF/DKIM failures from spoofing the "from" address.
- Sends plain text only (no HTML), so nothing a visitor types can inject
  markup or scripts into the email.
- Serves the static site itself and blocks `/server/*` so the source and
  `.env` are never reachable over HTTP.

## Note for later: an admin view

If you ever build a page to browse stored submissions, don't render the
`name`/`message` fields as raw HTML — they're untrusted visitor input.
Render as plain text (or escape before inserting into the DOM) so a
submission can't inject markup/scripts into that page.
