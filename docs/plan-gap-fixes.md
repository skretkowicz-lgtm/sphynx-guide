# Plan — closing the four storyboard gaps

Scope: contact-form autoreply, lead status in the app, appointment emails, and
password reset. Assessed against the code as it stands at `26c9d23`.

**Verdict up front:** all four are feasible, none needs an architectural change,
and none is a research problem. Total ≈ **17–27 focused hours**, plus a one-off
domain and mail setup (task −1) that is configuration rather than code.

The order below is deliberate — task −1 unblocks two of the four features, task 0
is shared groundwork, and the security-sensitive work is sequenced onto a mail
path that has already been proven in production.

---

## Task −1 — Point `sphynx.guide` at the app and at Resend (prerequisite)

The domain is bought (via Railway). Until it is wired up, `MAIL_FROM` is
Resend's shared `onboarding@resend.dev`, which
[server/README.md:29](server/README.md:29) records as able to deliver **only** to
the address the Resend account was registered with. That is fine for the contact
notification (it goes to you) and fatal for tasks 1 and 3 (they go to clients).

**Work — all dashboard, no code**

1. **Railway → Settings → Networking:** add `sphynx.guide` as a custom domain on
   the service, alongside the generated `*.up.railway.app` one.
2. **Resend → Domains:** add `sphynx.guide` and create the DNS records it asks
   for — SPF (TXT), DKIM (TXT), and an MX record on the sending subdomain.
   - Railway is the registrar here, so check its DNS panel actually supports
     custom TXT and MX records. If it doesn't, move the nameservers to Cloudflare
     (free) and manage DNS there. This is the only step with any real chance of
     surprising you.
   - Add a DMARC record (`_dmarc`, TXT, starting at `p=none`) once SPF and DKIM
     verify. Not required, but it is what stops a young domain's mail landing in
     spam.
3. **Env vars, in Railway → Variables:** set `MAIL_FROM` to something on the
   domain — `kontakt@sphynx.guide` or `no-reply@sphynx.guide` — and
   `ALLOWED_ORIGIN` to `https://sphynx.guide`, which the CORS config at
   [server/server.js:89](server/server.js:89) reads.
4. **Supabase → Authentication → URL Configuration:** add `https://sphynx.guide`
   to **Site URL** and **Redirect URLs**, per
   [server/README.md:82](server/README.md:82). Task 4 depends on this, and
   `emailRedirectTo` at [login.html:429](login.html:429) derives from
   `window.location.origin`, so it follows the domain automatically once this is
   allowlisted.
5. **Supabase → Authentication → SMTP:** point custom SMTP at Resend, using the
   now-verified domain. Supabase's built-in sender is severely rate-limited and
   documented as not for production. Note this is Supabase's own outbound
   connection, so the reason `aad4d9a` moved the app off SMTP (Railway blocks
   outbound SMTP ports) does not apply. This also fixes signup-confirmation
   delivery, which has the same limit today.

**Effort:** 1–2 h, most of it waiting for DNS to propagate. **Risk:** low, with
the Railway-DNS caveat above. Update
[server/README.md:29](server/README.md:29) once done — it currently tells a
future reader to stay on the shared sender.

---

## Task 0 — Shared groundwork (prerequisite)

Two of the four features send mail, and today mail is a single inline
`resend.emails.send()` call at [server/server.js:166](server/server.js:166) with
the body assembled as an array of strings just above it. That's fine for one
message and unpleasant for five.

**Work**

- Extract `server/mail.js`: one `send()` wrapper that normalises Resend's
  `{ error }`-instead-of-reject behaviour (the comment at
  [server/server.js:164](server/server.js:164) already documents this quirk —
  move it with the code), plus a small bilingual template helper.
- Templates emit EN and PL in one message, separated by a rule. The site is
  bilingual everywhere else and `profiles` has no language column, so this
  avoids both a migration and the "we guessed wrong" failure mode. Revisit only
  if the double-length emails annoy you in practice.

**Effort:** 1–2 h. **Risk:** low — pure refactor, existing contact mail is the
regression test (`server/scripts/test-contact-form.js` already exercises it).

---

## Task 1 — Contact-form autoreply

**Feasibility: straightforward.** Everything needed is already in the handler.

**Work**

- In [server/server.js:120](server/server.js:120), after the behaviourist
  notification, send a second message to the visitor's `email`.
- Send it *concurrently* with the existing pair, but treat its failure as
  non-fatal — log and move on. The behaviourist notification is the one whose
  failure justifies a 502; an autoreply that didn't send must not tell the
  visitor their message failed when it actually arrived.
- Add a `lang` field to the contact form POST in
  [index.html:636](index.html:636) so the reply matches the language the page
  was in. Cheap, and better than sending both here — this is the one email
  where you know the recipient's language for certain.
- Content: their name, an echo of their message, a realistic response window,
  and a line pointing at [privacy.html](privacy.html).

**Design decision — echo the message or not.** Echoing is the actual storyboard
value ("she has a copy, she knows it sent"). It also turns the endpoint into
something that will deliver attacker-supplied text to any address they type. The
existing controls — honeypot at [index.html:639](index.html:639), 5 requests per
10 minutes per IP at [server/server.js:94](server/server.js:94) — are
proportionate at this scale, but the exposure is real and worth naming.
Recommendation: **echo it**, keep the sender clearly the site, and add
`replyTo: CONTACT_TO` so a reply to the autoreply reaches you rather than
bouncing.

**Effort:** 1.5–3 h including the `lang` plumbing and PL copy.

**Risks**
- Deliverability: depends entirely on task −1 being done. On the shared Resend
  sender this feature silently fails for every real visitor.
- A brand-new sending domain has no reputation, so the first weeks are the most
  likely to land in spam. Send yourself a test from a Gmail and an Outlook
  address before trusting it.
- Bounces on typo'd addresses are now routine; make sure the log line is
  greppable.

---

## Task 2 — Lead status in the behaviourist view

**Feasibility: straightforward, with one structural note.**

`contact_submissions` was created with RLS enabled and **zero policies**
([server/README.md:51](server/README.md:51)) — deliberately unreachable from the
browser, server-only. Surfacing leads means opening a narrow read path.

Two options:

| | Approach | Verdict |
|---|---|---|
| **A** | Add `is_behaviourist()` SELECT + UPDATE policies; `profile.html` queries the table directly | **Recommended** — identical to how appointments, consultations, and documents already work |
| **B** | New server endpoint proxying with the service-role key | More code, a second data-access pattern, no benefit here |

**Work (option A)**

- New `sql/006_contact_leads.sql`, following the house style of
  [sql/005_appointments.sql](sql/005_appointments.sql):
  - `status text not null default 'new' check (status in ('new','contacted','converted','archived'))`
  - `handled_by uuid references public.profiles(id)`, `handled_at timestamptz`
  - `internal_note text` — private, since nobody without a behaviourist role can
    read this table at all
  - SELECT policy: `public.is_behaviourist()`
  - UPDATE policy: `is_behaviourist()` in both `using` and `with check`, written
    out explicitly for the same reason `005` spells it out
  - **No INSERT policy** — inserts stay service-role-only from the server, so
    the anon key still cannot forge a lead
  - `create index on public.contact_submissions (status, created_at desc)`
  - Reuse the `set_updated_at()` trigger function from `005`
- `profile.html`: a **Leads** panel in the behaviourist branch, above the client
  picker. Renders name, email, phone, the `behaviourist` flag, message, and
  status buttons. The existing `renderAppointments` / `statusActions` pair at
  [profile.html:924](profile.html:924) is a near-exact template — same shape,
  different verbs.
- Default the list to `status = 'new'`, with a toggle to show all.

**Effort:** 5–8 h — the largest of the four, almost entirely UI. The SQL is
~40 lines and low-risk.

**Risks**
- **Privacy**: this puts non-account-holders' personal data on a web page for the
  first time. Check that [privacy.html](privacy.html) already covers contact-form
  data and retention; if it names only email delivery, it needs a line. Consider
  an archive-after-N-months story now rather than later.
- Linking a lead to the `profiles` row created when that person later signs up is
  genuinely useful and genuinely more work (email matching, a nullable FK,
  handling the mismatch case). **Explicitly deferred to v2.**

---

## Task 3 — Appointment emails

**Feasibility: feasible, and the most design-sensitive of the four.**

The obstacle is structural, not hard: appointments are written from the browser
straight to Supabase under RLS ([profile.html:1022](profile.html:1022)), while
the Resend key lives server-side and must stay there. Something has to bridge
them.

| | Approach | Verdict |
|---|---|---|
| **A** | Browser POSTs to a new `/api/notify/appointment` after a successful write; server verifies the JWT and sends | **Recommended** |
| **B** | Move appointment writes through the server entirely | Atomic, but discards the RLS design in `005` that's already doing this job well |
| **C** | Supabase Database Webhook → server endpoint | Most robust (fires regardless of client) but needs dashboard config and a **publicly reachable URL**, so it cannot be tested on localhost. Poor fit for this project's dev loop |

**Work (option A)**

- `POST /api/notify/appointment { appointment_id, event }` where `event` is
  `created` / `rescheduled` / `cancelled`.
- Auth: read the bearer token, call `supabase.auth.getUser(jwt)` on the
  service-role client, then confirm that user's `profiles.role` is
  `behaviourist`. **Never trust an owner id or an email address from the request
  body** — take `appointment_id` only, and read every other field server-side.
  This is the security-critical part of the whole plan; budget the review time
  here.
- Server reads the appointment + the owner's profile, renders the bilingual
  template (date in `Europe/Warsaw` — reuse the `PRACTICE_TZ` constant the
  timezone warning at [profile.html:1013](profile.html:1013) already relies on),
  and sends. Include `location` and `notes`, since `005` documents `notes` as
  client-visible preparation instructions.
- Its own rate limiter — authenticated, so a much higher ceiling than
  `contactLimiter`.
- Call it from three places in `profile.html`: the insert handler
  ([profile.html:1022](profile.html:1022)), the reschedule path, and
  `updateAppointmentStatus` via `statusActions`
  ([profile.html:924](profile.html:924)).
- **Surface the result in the UI.** The status line must distinguish "saved and
  the client was emailed" from "saved, but the email failed" — otherwise this
  feature replaces a known manual step with an unreliable invisible one, which is
  worse than what exists today.
- CSP and CORS need no change: `connect-src 'self'` and the POST-only CORS config
  at [server/server.js:89](server/server.js:89) already permit this.

**Effort:** 4–7 h. JWT verification and the three call sites are most of it.

**Risks**
- **Accepted limitation of option A:** if the browser dies between the Supabase
  write and the notify call, the appointment exists and no email goes out. This
  is why the UI must report send status honestly. If it bites in practice,
  option C is the upgrade path and the endpoint built here is reusable as-is.
- Don't email on `no_show` or `reinstate` — those are your bookkeeping, not news
  the client needs. Only `created`, `rescheduled`, `cancelled`.
- Guard against emailing about appointments in the past.

---

## Task 4 — Password reset

**Feasibility: feasible. Small amount of code, one real prerequisite.**

`login.html` has no recovery path at all today. Supabase provides the whole flow;
the work is UI plus a dashboard change.

**Prerequisite:** steps 4 and 5 of task −1 (redirect allowlist, custom SMTP).
Reset mail goes through Supabase's sender, not Resend's API directly — so unlike
tasks 1 and 3 this one *would* work without the domain, just throttled to a
handful of sends per hour. With the domain in hand there's no reason to accept
that.

**Work**

- The auth card at [login.html:247](login.html:247) already switches everything
  via `data-mode` CSS, so adding modes is cheap and self-consistent. Add two:
  - `reset-request` — email field only, "Send reset link", reached from a
    *Forgot password?* link next to the submit button
  - `new-password` — new password field, shown when the page loads with recovery
    parameters
- `reset-request` calls `resetPasswordForEmail(email, { redirectTo: <login.html> })`
  and shows a **neutral** confirmation whether or not the account exists — do not
  leak which addresses are registered.
- `new-password` reuses `isPasswordBreached()` and `MIN_PASSWORD_LENGTH` from
  [login.html:368](login.html:368) — already extracted as a function, so a new
  mode can call it without touching it. Then `updateUser({ password })`, then
  redirect to `profile.html`.
- Add the *Forgot password?* link and Polish copy for every new string.

**Effort:** 3–5 h, of which ~1 h is copy and the bilingual `<span lang>` pairs.

**Risks**
- **Confirm which recovery flow your project emits.** Depending on the Supabase
  email template, the link arrives either as tokens in the URL fragment (picked
  up by `detectSessionInUrl`, firing a `PASSWORD_RECOVERY` event) or as a
  `token_hash` requiring an explicit `verifyOtp` call. Check the actual template
  in the dashboard before writing the handler — this is the one place where
  guessing costs an afternoon.
- The redirect URL must be on the Supabase Auth allowlist. `emailRedirectTo`
  at [login.html:429](login.html:429) already points at `login.html`, so this is
  very likely already configured — worth confirming, not worth worrying about.
- The recovery link grants a session. Redirect away from `new-password` mode
  immediately after a successful change so a back-button press doesn't land on a
  stale form.

---

## Sequencing

Ordered so that each step de-risks the next, and so anything you stop after is
still shippable on its own.

| # | Step | Effort | Why here |
|---|---|---|---|
| 0 | Task −1 — domain, DNS, SMTP, env vars | 1–2 h | Unblocks tasks 1 and 3, improves task 4. Start it first because DNS propagation is dead time you can work through |
| 1 | Task 2 — lead status | 5–8 h | Sends no email at all, so it is the one thing that can be built *while* DNS settles |
| 2 | Task 0 — `server/mail.js` | 1–2 h | Both mail features build on it |
| 3 | Task 1 — autoreply | 1.5–3 h | Smallest mail feature; proves the new domain really delivers before anything important rides on it |
| 4 | Task 4 — password reset | 3–5 h | Independent of the rest; SMTP has had time to settle |
| 5 | Task 3 — appointment emails | 4–7 h | The security-sensitive one, last, on a mail path now proven twice |

**Total: ≈ 17–27 focused hours** plus setup, across four independently shippable
PRs.

Step 1 is placed there deliberately: it is the only feature with no dependency on
mail, so it fills the gap while DNS verification is pending instead of leaving
you blocked.

## Three decisions to confirm before implementation

1. **Autoreply echoes the visitor's message?** Recommending yes — it's the whole
   point of the storyboard frame — accepting that the form can then deliver
   typed text to any address, behind the honeypot and rate limit.
2. **Appointment emails via option A (client-notifies-server)?** Recommending
   yes. The tradeoff is a missed email if the browser dies mid-flow, made visible
   in the UI rather than hidden.
3. **Bilingual emails, or add a language preference to `profiles`?**
   Recommending bilingual for appointment mail (no migration, cannot guess
   wrong) and single-language for the autoreply (the page language is known at
   send time).

## Explicitly out of scope

Carried over from [docs/storyboards.md](docs/storyboards.md) and **not** included
in the estimates above: client-initiated reschedule requests, private
behaviourist-only prep notes, append-only consultation corrections, and linking a
lead to the profile created when that person later signs up.
