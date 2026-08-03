# Contact form backend

Small Express server that serves the Sphynx guide's static site and handles
`POST /api/contact` by saving the submission to Supabase and emailing it
over SMTP.

Dependencies and the `start` script live in the repo-root `package.json`
(standard Node layout, and what the host builds from); only `server.js`,
its helper scripts, and `.env` live in this directory.

## Setup

```bash
npm install
cp server/.env.example server/.env
```

Edit `server/.env` with your SMTP details. For a Gmail mailbox:

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

Run it from the repo root, not from `server/`. Open http://localhost:3000 —
this serves `index.html` and handles form submissions in one process, so
there's nothing else to configure.

## Deploying to Railway

Railway builds from the repo root, detects Node from the root
`package.json`, and runs `npm start`. No Dockerfile or build config needed.

1. At https://railway.app, create a project from the GitHub repo.
2. Under the service's **Variables**, add every key from
   `server/.env.example` with your real values — `.env` is gitignored and
   is never deployed, so the platform is the only place production gets
   them. Also set `NODE_ENV=production`.
3. Under **Settings → Networking**, generate a public domain.
4. In Supabase → **Authentication → URL Configuration**, add that domain to
   **Site URL** and **Redirect URLs**. Without this, the confirmation link
   in signup emails will refuse to redirect back to the deployed site.

`PORT` is supplied by Railway and read automatically — don't set it.

`NODE_ENV=production` also switches on `trust proxy`, which the rate
limiter needs to see real client IPs through Railway's reverse proxy.
Without it every visitor shares one rate-limit bucket, so a single busy
user would lock out everyone else.

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
- Mounts only the pages, `js/` and `images/`, so `server/`, `sql/` and
  anything else added at the repo root stay private by default rather than
  needing an explicit exclusion.

## Note for later: an admin view

If you ever build a page to browse stored submissions, don't render the
`name`/`message` fields as raw HTML — they're untrusted visitor input.
Render as plain text (or escape before inserting into the DOM) so a
submission can't inject markup/scripts into that page.
