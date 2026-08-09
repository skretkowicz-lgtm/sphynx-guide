# Contact form backend

Small Express server that serves the Sphynx guide's static site and handles
`POST /api/contact` by saving the submission to Supabase and emailing it
through Resend.

Dependencies and the `start` script live in the repo-root `package.json`
(standard Node layout, and what the host builds from); only `server.js`,
its helper scripts, and `.env` live in this directory.

## Setup

```bash
npm install
cp server/.env.example server/.env
```

### Email (Resend)

Mail goes out over Resend's HTTPS API rather than SMTP. Railway and most
other hosts block outbound SMTP ports to deter spam, so connecting to
`smtp.gmail.com` from a deployed app hangs until it times out; port 443
always works.

1. Sign up at https://resend.com — register with the address you want the
   notifications delivered to.
2. Create an API key at https://resend.com/api-keys and put it in
   `RESEND_API_KEY`.
3. Verify your sending domain at https://resend.com/domains (choose the
   **EU region** — it keeps message data in the EU, which is what the
   privacy notice promises) and set `MAIL_FROM` to an address on it.

   The shared `onboarding@resend.dev` sender needs no DNS setup but can
   **only** deliver to the address you registered with Resend. That is
   enough for the notification, which goes to your own inbox, and silently
   breaks the confirmation sent back to the visitor.

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
- Sends from `MAIL_FROM` with `replyTo` set to the visitor's address, so
  replying goes straight to them without spoofing the "from" address and
  risking SPF/DKIM failures.
- Sends the visitor a confirmation of their own message, in whichever
  language the page was in, with `replyTo` pointing back at `CONTACT_TO`.
  Its failure is logged but never fails the request: the message has still
  reached you, so reporting an error to the visitor would be a lie.
- Throttles that confirmation to **one per recipient address per hour**.
  Both the recipient and the message body are chosen by whoever fills the
  form, so without this the endpoint will deliver arbitrary text to anyone,
  from an address you own and DKIM-sign. The per-IP limit does not help
  there — IPs are cheap. Submissions and your own notification are never
  throttled; only the duplicate confirmation is skipped, and the skip is
  logged, because a burst of them is what abuse looks like.

  The counter lives in memory, so it resets on redeploy and is per-instance.
  That is fine for a single replica. If this is ever scaled out, move it to
  the database — `contact_submissions` already records `email` and
  `created_at`.
- Emails the client when an appointment is created, cancelled or reinstated,
  via `POST /api/notify/appointment` (see below).

## `POST /api/notify/appointment`

Appointments are written from the browser straight to Supabase under RLS,
but the Resend key lives on the server and must stay there — so the browser
asks this endpoint to do the telling.

The request body carries **only** `{ appointment_id, event }`. Who the client
is, their address and the session times are all read here from the database,
so a caller cannot direct a message at someone else. The worst a stolen
behaviourist token achieves is re-sending a genuine notification to the
genuine client.

- Requires `Authorization: Bearer <supabase access token>`. The token is
  validated against the auth server, not merely decoded, and the
  `behaviourist` role is read from `profiles` rather than trusted from the
  token's claims.
- `event` is one of `created`, `cancelled`, `reinstated`. There is no
  `no_show`: that is a note to self about a session that already failed to
  happen, and mailing someone about it would be a reproach.
- Appointments in the past are skipped — `{ ok: true, sent: false, reason:
  "past" }`. That is not an error; the status change itself succeeded.
- Mail is bilingual. `profiles` has no language column, and for "your session
  has moved" a wrong guess is worse than a long email.

**Known limitation.** The browser sends the notification after its own write
succeeds, so if the tab dies in between, the appointment exists and no email
goes out. `profile.html` therefore states explicitly whether the client was
emailed, rather than implying it. Moving to a Supabase database webhook would
close the gap, at the cost of needing a publicly reachable URL — which cannot
be tested on localhost.
- Sends plain text only (no HTML), so nothing a visitor types can inject
  markup or scripts into the email.
- Mounts only the pages, `js/` and `images/`, so `server/`, `sql/` and
  anything else added at the repo root stay private by default rather than
  needing an explicit exclusion.

## Demo data

`scripts/seed-demo-data.js` fills a Supabase project with a synthetic
practice, so the app can be demonstrated and tested against something other
than empty lists. The cast and its timeline live in
`test-data/demo-dataset.js`; the PDF and PNG bytes behind the seeded
documents are generated by `test-data/demo-files.js` rather than checked in
as binaries.

```bash
npm run seed:demo              # dry run: print the plan, write nothing
npm run seed:demo -- --live    # create or refresh the demo practice
npm run seed:demo:purge -- --live   # delete it again
```

It needs `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `DEMO_PASSWORD` from
`.env` — no Resend key, and the server does not have to be running. The
service_role key is unavoidable here: creating auth users, promoting the
behaviourist, and writing rows on behalf of six different people are all
things RLS exists to prevent a browser from doing.

`DEMO_PASSWORD` is the shared sign-in password for the seeded accounts, and it
is kept out of the repo deliberately. The accounts are real ones in whichever
project is seeded, and the demo behaviourist can read every genuine client's
consultations, documents and leads — so a password in the source would be a
working login to a live practice, published to anyone who reads it. The script
refuses to seed without the variable and prints a generated candidate to
paste. Re-seeding resets every demo account to whatever it currently says, so
rotating the password is one edit and one run. Purging needs no password.

A few things it deliberately does not shortcut:

- Accounts are created through the admin auth API, so the `profiles` row is
  written by the `on_auth_user_created` trigger, exactly as a real signup
  would. The behaviourist is then promoted by the same `update profiles set
  role` this README documents doing by hand — which works for the same
  reason: `auth.uid()` is null for the service_role key, so
  `prevent_role_escalation` lets it through.
- Storage objects are uploaded before the `documents` rows that point at
  them, so every seeded document has a working signed-URL download.
- `handled_by`/`handled_at` on leads are set outright rather than left to the
  trigger, which reads `auth.uid()` — null here. It fires on UPDATE only, and
  seeded leads arrive as inserts carrying their final status.

Accounts are matched by address and every other row has a fixed id, so the
script is safe to re-run and `--purge` can only ever remove what it created.

## Note for later: an admin view

If you ever build a page to browse stored submissions, don't render the
`name`/`message` fields as raw HTML — they're untrusted visitor input.
Render as plain text (or escape before inserting into the DOM) so a
submission can't inject markup/scripts into that page.
