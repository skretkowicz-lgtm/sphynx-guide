# User storyboards — Canadian Sphynx Owner's Guide

Two end-to-end journeys through the site **as it stands after the August 2026
changes**: guide, contact form with autoreply, enquiry pipeline, accounts with
password recovery, consultations, documents, and appointments that email the
client. Live at https://sphynx.guide.

Each frame is one moment: what the person sees, what they do, what the system
does behind it, and how it feels.

Frames marked **⚠ seam** are places where the product still hands work back to
email or leaves someone guessing. They are collected at the end. The previous
version of this document — the one that found the four seams since closed — is
in the git history of this file.

---

## Persona 1 — Ola, Sphynx owner

**Who:** 34, Warsaw. Got Nero, a 10-month-old Sphynx, four months ago. Reads
Polish by preference. Almost always on her phone, usually in the evening after
Nero has done something alarming.

**Trigger:** Nero has started peeing on the bed.

### Frame 1 — Arrival, on a phone, at 22:40

| | |
|---|---|
| **Sees** | A Sphynx, and a guide **already in Polish**. |
| **Does** | Starts reading. Never notices there is a language toggle. |
| **System** | `js/lang.js` reads `navigator.languages` before first paint. Her phone is `pl-PL`, so the page opens Polish. |
| **Feels** | Nothing — which is the point. The site met her in her own language without asking her to do anything. |

### Frame 2 — Skimming for her problem

| | |
|---|---|
| **Sees** | Four sections: Charakterystyka, Temperament, Żywienie, **Zachowanie**. |
| **Does** | Scrolls past the first three. |
| **System** | Static anchored sections; the mobile layout stacks them single-column. |
| **Feels** | Oriented. She can see the whole scope in one thumb-scroll — it isn't an infinite blog. |

### Frame 3 — The moment of "this is about *my* cat"

| | |
|---|---|
| **Sees** | The Behaviour section describing stress-driven marking in a breed that bonds hard to one person. |
| **Does** | Reads it twice. Thinks: *he started this the week I went back to the office.* |
| **System** | Nothing — pure content. |
| **Feels** | Recognition, then guilt. The emotional hinge of the whole journey: "my cat is being spiteful" has just become "my cat is stressed". |

### Frame 4 — Deciding she needs a person

| | |
|---|---|
| **Sees** | The contact form, in Polish, with a checkbox — *Chcę skonsultować się z behawiorystą*. |
| **Does** | Ticks it. Writes three paragraphs about Nero, the bed, and her new commute. |
| **System** | A hidden honeypot sits above the real inputs; bots fill it, Ola never sees it. |
| **Feels** | Slightly exposed — she is admitting in writing that she may have caused this — but the checkbox makes asking for help feel offered rather than escalated. |

### Frame 5 — Send, and a reply within seconds

| | |
|---|---|
| **Sees** | The form confirms. Moments later an email: *Otrzymaliśmy Twoją wiadomość*, with her own three paragraphs quoted back, and "zazwyczaj odpowiadamy w ciągu 2 dni roboczych". |
| **Does** | Reads it, puts the phone down. |
| **System** | `POST /api/contact` → row in `contact_submissions` → two emails via Resend: one to the behaviourist, one back to Ola. Her copy goes out in the page's language, and its failure is logged rather than reported — the message reached the behaviourist either way. |
| **Feels** | Settled rather than uncertain. She has a record of what she wrote, an address to reply to, and a stated timeframe. **This is the frame that used to be a void.** |

### Frame 6 — The reply, and an account

| | |
|---|---|
| **Sees** | An email next morning proposing Thursday, with a link to the site. |
| **Does** | Opens `login.html`, creates an account. |
| **System** | `signUp` with `emailRedirectTo` back to `login.html`; a trigger creates her `profiles` row with role `owner` — never taken from the browser, so self-promotion is closed off at creation. |
| **Feels** | Mild friction, accepted. She is expecting to hand over notes about her cat. |

### Frame 7 — The password that gets refused

| | |
|---|---|
| **Sees** | Her usual password is rejected: too short, or found in a known breach. |
| **Does** | Grumbles. Picks another. |
| **System** | Twelve-character minimum plus a k-anonymity breach lookup — only a hash prefix leaves the browser. The same check now guards password *recovery* too, not just signup. |
| **Feels** | Briefly annoyed, then reassured. Nobody bothers checking this for a site holding nothing real. |

### Frame 8 — Confirm, then sign in

| | |
|---|---|
| **Sees** | *Sprawdź swoją skrzynkę e-mail…* — then the confirmation mail, arriving promptly. |
| **Does** | Clicks through, comes back, signs in. |
| **System** | Supabase auth mail now leaves through Resend SMTP on the practice's own domain rather than the built-in sender, which was throttled to a handful an hour. |
| **Feels** | Ordinary. Still three app-switches, but nothing stalls. |

### Frame 9 — Her own page

| | |
|---|---|
| **Sees** | Her profile in Polish: **Nadchodzące Wizyty**, **Historia Konsultacji**, **Dokumenty**. |
| **Does** | Reads Thursday's session — 18:00, online, 60 minutes, a link, and a line of preparation notes. |
| **System** | RLS scopes every query to `owner_id = auth.uid()`. The location only becomes a clickable link if it matches `^https://`, so a `javascript:` scheme cannot be smuggled onto her page. |
| **Feels** | Confirming rather than informing — she already knew, because the booking emailed her the moment it was made. |

### Frame 10 — Doing her homework

| | |
|---|---|
| **Sees** | The preparation note asks for a video of Nero near the litter box, and photos of where the boxes are. |
| **Does** | Uploads a video and two photos. |
| **System** | Upload to Supabase Storage at `{owner_id}/{document_id}/{filename}` — the first path segment is checked against `auth.uid()` — plus a `documents` row. Both insert-only: she can add, never quietly retract. |
| **Feels** | Useful. She is contributing to the session rather than waiting for it. |

### Frame 11 — The session

| | |
|---|---|
| **Sees** | The video call at the appointed time. |
| **Does** | Talks for an hour. Nero walks across the keyboard. |
| **System** | Off-platform. |
| **Feels** | Heard, and given a plan. |

### Frame 12 — Coming back for the plan

| | |
|---|---|
| **Sees** | A week later: **Historia Konsultacji** holds the session and what was agreed. |
| **Does** | Re-reads step three, which she had half-forgotten. |
| **System** | `consultations` has no UPDATE or DELETE policy — the record of advice given is immutable by design. |
| **Feels** | Trust. The advice is where she left it, unedited. |

### Frame 13 — Something changes

| | |
|---|---|
| **Sees** | Thursday's follow-up no longer works; she has a work trip. |
| **Does** | Looks for a reschedule button on her appointment. There isn't one. Emails instead. |
| **System** | Only the behaviourist may write to `appointments`. |
| **Feels** | Mildly deflated — though she is emailing a person she has now met, not an unknown inbox. **⚠ seam: the one place the product still opens back into email.** |

### Frame 14 — Six months later, locked out

| | |
|---|---|
| **Sees** | She cannot remember her password. Under the sign-in form: *Nie pamiętasz hasła?* |
| **Does** | Enters her email, follows the link, sets a new password, lands straight on her profile. |
| **System** | `resetPasswordForEmail` answers identically whether or not the address has an account, so the form cannot be used to test who is a client of a behaviourist. The recovery link's session is detected *before* the "already signed in" redirect could carry her past the password form, and the token is scrubbed from the address bar afterwards. |
| **Feels** | Unremarkable — which is the whole achievement. **Six months ago this ended the relationship.** |

---

## Persona 2 — You, the behaviourist

**Who:** the site's only `role = 'behaviourist'` account, promoted once by hand
from the Supabase SQL editor. Sole practitioner, bilingual practice. Laptop
between clients, phone between trains.

**Trigger:** a contact-form email arrives at 22:41.

### Frame 1 — The lead lands, twice

| | |
|---|---|
| **Sees** | An email with Ola's details and her message. |
| **Does** | Reads it in bed. Decides it is a real case. |
| **System** | Resend delivers the notification; the submission is already durable in `contact_submissions`, so the email is a notification and not the only copy. |
| **Feels** | Qualified interest — the checkbox did the triage before you opened anything. |

### Frame 2 — The enquiry is already on your dashboard

| | |
|---|---|
| **Sees** | Signing in, **Zapytania** sits above everything else with a red **2 nowe** badge. Ola's row carries **Chce konsultacji**. |
| **Does** | Reads her message in full without leaving the page. |
| **System** | `contact_submissions` had RLS on and *no* policies; `sql/006` opens SELECT and UPDATE to the behaviourist only. INSERT still has no policy, so leads arrive only via the server and cannot be forged from a browser. |
| **Feels** | In control of the top of the funnel for the first time. The inbox is no longer the system of record. |

### Frame 3 — Working the lead

| | |
|---|---|
| **Sees** | Status buttons on the row: *Skontaktowano*, *Archiwizuj*. A collapsed private note. |
| **Does** | Replies by email, marks the lead **contacted**, and writes "wants evenings, has a work trip mid-month" in the note. |
| **System** | `handled_by` and `handled_at` are stamped by a trigger rather than accepted from the browser — a client-writable "who dealt with this, and when" is a field that can lie. Column grants mean you can change only the status and the note; the name, email and message cannot be rewritten after the fact. |
| **Feels** | The note is the quiet win. Last month that lived in your head until it didn't. **⚠ seam: the reply itself is still typed in your mail client.** |

### Frame 4 — The week at a glance

| | |
|---|---|
| **Sees** | **Nadchodzące — Wszyscy Klienci**, in time order. |
| **Does** | Scans it before the day starts. |
| **System** | `appointments_select` grants the behaviourist every row; a dedicated index serves exactly this cross-client query. |
| **Feels** | In control of the day. The screen you would keep open. |

### Frame 5 — Picking up a client

| | |
|---|---|
| **Sees** | A client picker; choosing Ola opens appointments, consultations and documents. |
| **Does** | Reads her history back before the call. |
| **System** | `is_behaviourist()` is `security definer` with a pinned `search_path`, so cross-client reads do not recurse through RLS on `profiles`. |
| **Feels** | Prepared. One click from "who is this again" to the full picture. |

### Frame 6 — Booking Thursday, and knowing which Thursday

| | |
|---|---|
| **Sees** | The appointment form. As you type the date, a line appears beneath it: **czwartek, 13 sierpnia 2026 18:00**. |
| **Does** | Sets 60 minutes, online, pastes the meeting link, writes "prześlij krótki film przy kuwecie". |
| **System** | The native picker renders in the *browser's* locale, which no page can override — on a US-locale machine `09/08` is unreadable. The echo names the weekday and month, in Warsaw time, which is exactly what gets stored. |
| **Feels** | Certain. You are no longer trusting a numeric format you did not choose. |

### Frame 7 — The message you no longer have to send

| | |
|---|---|
| **Sees** | *Wizyta zaplanowana. Klient został powiadomiony e-mailem.* |
| **Does** | Nothing. Moves on. |
| **System** | The browser posts only the appointment id to `/api/notify/appointment`; the server validates the token against the auth server, reads your role from the database rather than believing the token's claims, then looks up the client, their address and the times itself. A caller cannot direct a message at someone else. |
| **Feels** | The step that used to nag at you is gone. And when it fails the line says so in as many words — a silent failure here would be worse than the manual step it replaced. |

### Frame 8 — Prep, the morning of

| | |
|---|---|
| **Sees** | Ola's documents: one video, two photos. |
| **Does** | Watches the video. Spots that both litter boxes are beside the washing machine. |
| **System** | Storage select lets you read any client's objects; owners are confined to their own path prefix. |
| **Feels** | Ahead of the session. You arrive with a hypothesis rather than forming one live. |

### Frame 9 — Logging what was actually said

| | |
|---|---|
| **Sees** | The consultation form, with the same date echo beneath its date field. |
| **Does** | Straight after the call, logs the date, mode and agreed plan. |
| **System** | Insert-only. No edit, no delete, and Ola can read it. |
| **Feels** | Deliberate. Writing into something you cannot take back changes how you word it — the intended pressure. **⚠ seam: a typo is still forever.** |

### Frame 10 — A no-show

| | |
|---|---|
| **Sees** | A different client, last Tuesday, still marked `scheduled`. |
| **Does** | Marks it **Nieobecność**. |
| **System** | Status stores only what the timestamp cannot infer. A past appointment still marked `scheduled` *is* an attended one, so there is no "completed" button to forget. No email goes out: that would be a reproach, not information. |
| **Feels** | Quietly grateful for how little admin there is. |

### Frame 11 — A booking made against the wrong client

| | |
|---|---|
| **Sees** | Thursday is on the wrong person's record — and they have already been emailed about it. |
| **Does** | Cancels it, which emails them that it is off, then books the right client. |
| **System** | The database permits deleting a future appointment outright, but **no button exposes that**, so cancelling is the only route. History cannot be rewritten either way. |
| **Feels** | Recoverable but clumsy. The client sees a cancelled session they were never meant to have. **⚠ seam.** |

### Frame 12 — The reschedule, by email

| | |
|---|---|
| **Sees** | Ola's message: she has a work trip. |
| **Does** | Cancels Thursday and books the following week. |
| **System** | Two emails go out — a cancellation and a confirmation — because there is no edit-the-date action; a status update and an insert are the only writes the UI performs. |
| **Feels** | It works, and the client is told clearly both times. But you are still the only person who can move a date. **⚠ seam.** |

### Frame 13 — Closing the loop

| | |
|---|---|
| **Sees** | Ola's enquiry, still sitting at **Skontaktowano**. |
| **Does** | Marks it **Został klientem**. |
| **System** | Nothing links the lead to the profile she later created — the two records sit side by side, connected only by you recognising the name. |
| **Feels** | Satisfying, and slightly manual. **⚠ seam.** |

---

## What changed since the first storyboards

| Moment | Then | Now |
|---|---|---|
| Landing on the site | Always English; a Polish owner had to find a toggle | Opens in the browser's language; the choice persists across pages |
| After the contact form | Sent into a void — no copy, no timeframe | Confirmation within seconds, in her language, quoting her own message |
| Handling a lead | Lived in your inbox and your head | On the dashboard with status, private notes and a triage badge |
| After a booking | Announced by hand | Emailed automatically, with the UI stating whether it actually sent |
| Entering a date | Whatever format the browser chose | Read back as a named weekday and month |
| Forgetting a password | Ended the relationship | Self-service recovery |
| Where mail comes from | A shared sender that could only reach you | Your own verified domain, EU region, landing in inboxes |

## Seams that remain

Read side by side, three moments still show up on both sides:

| Moment | Ola feels | You feel | What's missing |
|---|---|---|---|
| Replying to a new enquiry (O5 / B3) | Fine — she has her copy | Still typing replies in a mail client | Reply from within the lead row, logged against it |
| Needing to move a date (O13 / B12) | Falls back to email | The bottleneck for a routine change | A client-initiated *request* — not write access, which the schema deliberately forbids |
| A booking made in error (B11) | Sees a cancelled session she was never in | Cannot simply remove it | A delete action for future appointments; the policy already allows it |

## Backlog

Ordered by how much of the journey each repairs:

1. **Client reschedule requests.** A "poproś o zmianę" action on the owner's appointment that reaches you, leaving the write path behaviourist-only.
2. **Delete a future appointment.** The RLS policy already permits it; only the button is missing. Turns a visible mistake into no mistake at all.
3. **Reply to a lead in-app.** Even a `mailto:` prefilled with the enquirer's name, plus an automatic status change, would remove the last routine trip to the inbox.
4. **Link a lead to the account it becomes.** Email matching at signup, with the mismatch case handled.
5. **Private prep notes on appointments.** `notes` is client-visible; leads already have `internal_note`, appointments do not.
6. **Consultation corrections.** Append-only follow-ups, keeping immutability while making a typo survivable.
7. **Notify without depending on the tab.** The browser triggers the email after its own write, so a tab dying in between leaves an appointment nobody was told about. A Supabase database webhook would close it, at the cost of a publicly reachable URL.
