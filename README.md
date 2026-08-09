# Sphynx Guide

A bilingual (English/Polish) owner's guide to the Canadian Sphynx, plus the
small client practice that runs behind it: a contact form that becomes a lead,
client accounts, consultation history, document uploads, and appointments that
email the client when they are booked or cancelled.

Live at https://sphynx.guide.

## What it is made of

| Layer | Choice |
|---|---|
| Pages | Four hand-written HTML files, no build step, no framework |
| Server | Express (Node 22), one process, serves the pages and two API routes |
| Database + auth | Supabase (Postgres, Row Level Security, Storage) |
| Mail | Resend HTTPS API — hosts block outbound SMTP |
| Host | Railway, built straight from the repo root |

There is no bundler and nothing to compile. `npm start` serves the same files
that are in the repo.

## Layout

```
index.html      the guide itself + the contact form
login.html      signup, sign-in, password recovery
profile.html    the app: appointments, consultations, documents, leads
privacy.html    privacy notice
js/             lang.js (which language to open in), site.js (shared chrome),
                supabase-client.js (anon key — safe in the browser)
server/         server.js, mail.js, .env, and the backend's own README
sql/            migrations, applied by hand in the Supabase SQL editor
docs/           storyboards and planning notes
```

Only the four pages, `js/` and `images/` are mounted by the server. Anything
else added at the repo root — `sql/`, notes, scripts — is private by default
because it was never served.

## Two kinds of user

**Owners** sign up themselves and get `role = 'owner'` from a database trigger,
never from the browser. They see only their own appointments, consultations and
documents.

**The behaviourist** is a single account, promoted once by hand in the Supabase
SQL editor:

```sql
update public.profiles set role = 'behaviourist' where email = 'her-email@example.com';
```

That account sees every client, the cross-client appointment schedule, and the
contact-form leads with status and private notes.

## Running it locally

```bash
npm install
```

Copy `server/.env.example` to `server/.env` and fill in your Resend and
Supabase values.

The browser needs pointing at the same Supabase project, and that is not read
from `.env` — the pages have no build step, so there is nothing to substitute
values into. Edit [js/supabase-client.js](js/supabase-client.js) and set
`SUPABASE_URL` and `SUPABASE_ANON_KEY` to your project's **Project URL** and
**publishable (anon)** key. Both are safe to commit; the anon key has no power
beyond what the RLS policies grant. The service_role key from `server/.env`
must never appear here or anywhere else under the site root.

Then:

```bash
npm start
```

Run it from the repo root, not from `server/`. The server refuses to start
with a clear message if any required variable is missing. Open
http://localhost:3000 — pages and API are the same process, so there is
nothing else to configure.

To exercise the contact form against a running server:

```bash
npm run test:contact
```

That is a dry run by default. `--live` sends real requests (and real mail);
see the header of [test-contact-form.js](server/scripts/test-contact-form.js)
for `--limit` and `--only`, which keep a live run under the rate limit.

## Database setup

Migrations are applied by pasting each file into the Supabase SQL editor once,
in order. They start at `002` — the original `contact_submissions` table is the
inline snippet in [server/README.md](server/README.md).

| File | Adds |
|---|---|
| [002](sql/002_profiles_consultations_documents.sql) | `profiles`, `consultations`, `documents`, the storage bucket, and RLS on all of them |
| [003](sql/003_add_indexes.sql) | Indexes for the queries the pages actually run |
| [004](sql/004_harden_functions.sql) | Pinned `search_path` on the security-definer functions |
| [005](sql/005_appointments.sql) | `appointments` + its policies |
| [006](sql/006_contact_lead_status.sql) | Lead status, `internal_note`, and behaviourist-only access to `contact_submissions` |

Consultations, documents and storage objects are insert-only on purpose: no
update or delete policy exists, so history cannot be quietly rewritten.

## Demo data for testers

An empty database shows an empty app, so there is a synthetic practice that
can be loaded into any Supabase project: one behaviourist, six clients, their
appointments, consultation history, real downloadable documents, and a
contact-form inbox with all four lead statuses represented.

```bash
npm run seed:demo
```

That is a dry run — it prints the cast and the timeline and writes nothing.
Applying it needs `DEMO_PASSWORD` in `server/.env`, which every seeded account
then signs in with; the script refuses to run without it and suggests one to
paste. It is not in the repo on purpose — these are real accounts, and the
demo behaviourist can read every client's records in whichever project you
seed, so a committed password would be a working login to a live practice.

```bash
npm run seed:demo -- --live
```

Start with `marta.zielinska@demo.sphynx.guide` for the behaviourist's view of
the whole practice, then any of the client addresses for what an owner sees.
Each client exists to show a different state — the long-running case, the
client who has booked but not yet been seen, the one with a no-show and a
cancelled session, and one account with nothing at all, because the empty
states need testing too. [server/test-data/demo-dataset.js](server/test-data/demo-dataset.js)
says which is which.

Every date is relative to the moment you seed, so "upcoming" stays upcoming.
Every row has a fixed id, so re-running refreshes the timeline instead of
duplicating it. To remove the whole practice again:

```bash
npm run seed:demo:purge -- --live
```

Addresses are all at `demo.sphynx.guide`, which is not a real mail domain —
nothing seeded here can be sent a real email by accident. It is still
synthetic data written with the service_role key: seed a development project,
not the one serving real clients.

## API

Both routes are rate-limited and accept JSON only.

- `POST /api/contact` — validates the submission, drops honeypot hits, stores
  it in `contact_submissions`, emails the behaviourist, and sends the visitor a
  confirmation in the page's language (throttled to one per address per hour,
  because both the recipient and the body are chosen by whoever fills the form).
- `POST /api/notify/appointment` — emails a client that a session was created,
  cancelled or reinstated. The body carries only `{ appointment_id, event }`;
  the recipient and times are read from the database, so a caller cannot aim a
  message at someone else. Requires a Supabase access token, validated against
  the auth server, with the role read from `profiles` rather than the token's
  claims.

[server/README.md](server/README.md) documents both in full, including the
known limitation that appointment mail is triggered by the browser after its
own write succeeds.

## A few decisions worth knowing

- **The service_role key never leaves the server.** `js/supabase-client.js`
  carries the publishable anon key, which has no power beyond what the RLS
  policies grant.
- **The page opens in the browser's language.** `js/lang.js` reads
  `navigator.languages` before first paint; an explicit toggle choice is stored
  and always wins. An auto-detected language is never stored, so a guess stays
  distinguishable from a decision.
- **Dates are read back as words.** The native date picker renders in the
  browser's locale, which the page cannot override, so every date field echoes
  the named weekday and month in Warsaw time.
- **Passwords are checked against known breaches** with a k-anonymity lookup —
  only the first five characters of a SHA-1 hash leave the browser.
- **Mail is plain text**, so nothing a visitor types can inject markup into an
  email.

## Deploying

Railway builds from the repo root, detects Node from `package.json`, and runs
`npm start`. Set every key from `server/.env.example` in the service's
Variables, plus `NODE_ENV=production` — it switches on `trust proxy`, which the
rate limiter needs to see real client IPs. Don't set `PORT`; the platform
supplies it. Full steps, including the Supabase redirect URLs that signup mail
depends on, are in [server/README.md](server/README.md).

## Docs

- [docs/storyboards.md](docs/storyboards.md) — both journeys end to end, frame
  by frame, with the seams that remain and a ranked backlog.
- [docs/plan-gap-fixes.md](docs/plan-gap-fixes.md) — planning notes.
