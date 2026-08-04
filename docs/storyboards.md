# User storyboards — Canadian Sphynx Owner's Guide

Two end-to-end journeys through the site as it exists today (guide + contact form
+ accounts + consultations + documents + appointments). Each frame is one moment:
what the person sees, what they do, what the system does behind it, and how it
feels.

Frames marked **⚠ seam** are places where the current build makes the person leave
the site, wait without feedback, or guess. They're collected at the end as a
backlog.

---

## Persona 1 — Ola, Sphynx owner

**Who:** 34, Warsaw. Got Nero, a 10-month-old Sphynx, four months ago. Reads
Polish by preference, English when she has to. Almost always on her phone,
usually in the evening after Nero has done something alarming.

**Trigger:** Nero has started peeing on the bed. She has already searched
"sphynx sika na łóżko" and found forum threads that contradict each other.

### Frame 1 — Arrival, on a phone, at 22:40

| | |
|---|---|
| **Sees** | Hero image of a Sphynx, the title *Canadian Sphynx — Owner's Guide / Przewodnik dla Właścicieli*, and an EN/PL toggle in the corner. |
| **Does** | Taps **PL**. |
| **System** | `js/site.js` swaps every `data-i18n` string in place; no page reload, no flash of English. |
| **Feels** | Relief. Half the cat sites she finds are machine-translated; this one was clearly written in Polish on purpose. |

### Frame 2 — Skimming for her problem

| | |
|---|---|
| **Sees** | Four sections: Characteristics, Temperament, Diet, **Behaviour**. |
| **Does** | Scrolls straight past the first three to Behaviour. |
| **System** | Static anchored sections (`#characteristics`, `#temperament`, `#diet`, `#behaviour`); the mobile layout from `26c9d23` stacks them single-column. |
| **Feels** | Oriented. She can see the whole scope of the guide in one thumb-scroll — it isn't an infinite blog. |

### Frame 3 — The moment of "this is about *my* cat"

| | |
|---|---|
| **Sees** | The Behaviour section describing stress-driven marking in a breed that bonds hard to one person. |
| **Does** | Reads it twice. Thinks: *he started this the week I went back to the office.* |
| **System** | Nothing — this is pure content. |
| **Feels** | Recognition, then guilt. This is the emotional hinge of the whole journey: the guide has just reframed "my cat is being spiteful" into "my cat is stressed." |

### Frame 4 — Deciding she needs a person, not a page

| | |
|---|---|
| **Sees** | The **Contact** section at the foot of the guide: name, email, phone, message, and a checkbox — *I'd like to consult a behaviourist*. |
| **Does** | Ticks the checkbox. Writes three paragraphs about Nero, the bed, and her new commute. |
| **System** | A hidden honeypot field (`#website`) sits above the real inputs; bots fill it, Ola never sees it. |
| **Feels** | Slightly exposed — she's admitting in writing that she may have caused this — but the checkbox makes asking for help feel like a normal, offered option rather than an escalation. |

### Frame 5 — Send, and the silence after

| | |
|---|---|
| **Sees** | The status line under the form confirms the message went. |
| **Does** | Puts the phone down. |
| **System** | `POST /api/contact` → row written to `contact_submissions` in Supabase → Resend delivers the email to the behaviourist over HTTPS. |
| **Feels** | Done, but unsure. **⚠ seam:** she gets no copy of her own message and no sense of when to expect a reply. Overnight she wonders whether it sent at all. |

### Frame 6 — The reply, and an account

| | |
|---|---|
| **Sees** | An email next morning proposing a session, with a link to the site. |
| **Does** | Opens `login.html`, taps *create an account*, enters her name, email, and a password. |
| **System** | `signUp` with `emailRedirectTo` back to `login.html`; the trigger in `sql/002` creates her `profiles` row with role `owner` — role is never taken from the browser, so self-promotion to behaviourist is closed off at creation. |
| **Feels** | Mild friction, accepted. She's expecting to hand over notes about her cat, so an account makes sense. |

### Frame 7 — The password that gets refused

| | |
|---|---|
| **Sees** | Her usual password is rejected: it's too short, or it's turned up in a known breach. |
| **Does** | Grumbles. Picks another. |
| **System** | Length check plus a k-anonymity breach lookup (`82b2522`) — only a hash prefix ever leaves the browser. |
| **Feels** | Briefly annoyed, then reassured. Nobody bothers checking this for a site that isn't holding anything real. |

### Frame 8 — Confirm, then sign in

| | |
|---|---|
| **Sees** | *Check your email to confirm your account, then sign in.* |
| **Does** | Switches to mail, clicks through, comes back, signs in. |
| **System** | Supabase email confirmation; the redirect lands back on `login.html`. |
| **Feels** | A beat too long. **⚠ seam:** it's three app-switches between "I want to see my appointment" and actually seeing it — and if she'd fumbled the password there is no *forgot password* link to fall back on. |

### Frame 9 — Her own page

| | |
|---|---|
| **Sees** | `profile.html` in owner mode: **Upcoming appointments**, **Consultation history**, **Documents**. Two of the three are empty. |
| **Does** | Reads the one appointment: Thursday 18:00, online, 60 min, with a link and a line of preparation notes. |
| **System** | RLS scopes every query to `owner_id = auth.uid()`. The location only renders as a clickable link if it matches `^https://`, so a `javascript:` scheme can't be smuggled into her page. |
| **Feels** | Held. Someone has this booked; it isn't sitting in an inbox thread any more. |

### Frame 10 — Doing her homework

| | |
|---|---|
| **Sees** | The preparation note asks for a video of Nero around the litter box, and photos of where the boxes are. |
| **Does** | Uploads a video and two photos. |
| **System** | Upload to Supabase Storage at `{owner_id}/{document_id}/{filename}` — the first path segment is checked against `auth.uid()` — plus a `documents` row. Both are insert-only: she can add, never quietly retract. |
| **Feels** | Useful. She's contributing to the session rather than waiting for it. |

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
| **Sees** | A week later: **Consultation history** now holds the session, with notes on what was agreed. |
| **Does** | Re-reads step three, which she'd half-forgotten. |
| **System** | `consultations` has no UPDATE or DELETE policy — the record of advice given is immutable by design. |
| **Feels** | Trust. The advice is where she left it, unedited. |

### Frame 13 — Something changes

| | |
|---|---|
| **Sees** | Thursday's follow-up no longer works; she has a work trip. |
| **Does** | Looks for a *reschedule* button on her appointment. There isn't one. Goes back to the contact form. |
| **System** | Only the behaviourist can insert or update `appointments`. |
| **Feels** | Deflated. **⚠ seam:** the loop opens back into email exactly where the product was starting to feel like a product. |

---

## Persona 2 — You, the behaviourist

**Who:** the site's only `role = 'behaviourist'` account, promoted once by hand
from the Supabase SQL editor. Sole practitioner. Bilingual practice. Runs on a
laptop between clients, on a phone between trains.

**Trigger:** a contact-form email from Ola arrives at 22:41.

### Frame 1 — The lead lands in your inbox

| | |
|---|---|
| **Sees** | An email with Ola's name, email, phone, message — and the flag that she ticked *consult a behaviourist*. |
| **Does** | Reads it on your phone in bed. Decides it's a real case, not a "what do they eat" question. |
| **System** | Server-side send via Resend; the same submission is already durable in `contact_submissions`, so the email is a notification and not the only copy. |
| **Feels** | Qualified interest. The checkbox is doing triage work for you before you've opened anything. |

### Frame 2 — Replying, by hand

| | |
|---|---|
| **Sees** | Your own mail client. |
| **Does** | Writes back proposing Thursday, and asks her to make an account on the site. |
| **System** | None. **⚠ seam:** this step lives entirely outside the product — there's no inbox in `profile.html`, so leads and replies are tracked in your head. |
| **Feels** | Slight drag. This is the part that doesn't scale past a handful of clients a week. |

### Frame 3 — Signing in

| | |
|---|---|
| **Sees** | The same `login.html` every client sees. |
| **Does** | Signs in. |
| **System** | `profile.html` reads your role and switches `data-mode` — one page, two entirely different products. |
| **Feels** | Neutral. Nothing marks you as staff except what appears after. |

### Frame 4 — The week at a glance

| | |
|---|---|
| **Sees** | **All appointments** across every client, in time order. |
| **Does** | Scans it before the day starts. |
| **System** | `appointments_select` grants the behaviourist every row; `appointments_scheduled_idx` serves exactly this cross-client query. |
| **Feels** | In control of the day. This is the screen you'd actually keep open. |

### Frame 5 — Picking up a client

| | |
|---|---|
| **Sees** | A client picker; choosing Ola opens her detail panel — upcoming appointments, past appointments, consultations, documents. |
| **Does** | Selects Ola, reads her account back before the call. |
| **System** | `is_behaviourist()` is `security definer` with a pinned `search_path`, so cross-client reads don't recurse through RLS on `profiles`. |
| **Feels** | Prepared. One click from "who is this person again" to the full history. |

### Frame 6 — Booking Thursday

| | |
|---|---|
| **Sees** | The appointment form: date/time, duration, mode (online / in person), location, notes. |
| **Does** | Sets Thursday 18:00, 60 minutes, online, pastes the meeting link, and writes preparation instructions — *please send a video near the litter box*. |
| **System** | Insert is behaviourist-only, `created_by` pinned to you, and `owner_id` must point at a real owner-role profile. A timezone warning fires if the browser's zone looks off. |
| **Feels** | Careful. The notes field is client-visible, which you have to hold in mind — it's for *her* preparation, not your private read on the case. **⚠ seam:** there's nowhere to put private prep notes. |

### Frame 7 — The message you can't send

| | |
|---|---|
| **Sees** | The booking saved. |
| **Does** | Switches back to email to tell Ola it exists. |
| **System** | **⚠ seam:** nothing emails on appointment create, update, or cancel — Resend is wired only to the contact form. |
| **Feels** | The one genuinely irritating step. You did the work in the app and still had to announce it by hand. |

### Frame 8 — Prep, the morning of

| | |
|---|---|
| **Sees** | Ola's documents: one video, two photos. |
| **Does** | Watches the video. Spots that both litter boxes are next to the washing machine. |
| **System** | Storage select policy lets you read any client's objects; owners are confined to their own path prefix. |
| **Feels** | Ahead of the session. You walk in with a hypothesis instead of forming one live. |

### Frame 9 — Logging what was actually said

| | |
|---|---|
| **Sees** | The consultation form under Ola's detail panel. |
| **Does** | Straight after the call, logs the date, mode, and the plan you agreed. |
| **System** | Insert-only. There is no edit and no delete — what you write is the permanent record, and Ola can read it. |
| **Feels** | Deliberate. Writing into something you can't take back changes how you word it. That's the intended pressure, but it means a typo is forever. **⚠ seam:** no correction path, not even an append-a-note. |

### Frame 10 — A no-show

| | |
|---|---|
| **Sees** | A different client, last Tuesday, still sitting there as `scheduled`. |
| **Does** | Marks it `no_show`. |
| **System** | Status carries only what the timestamp can't infer — `scheduled` / `cancelled` / `no_show`. A past appointment still marked `scheduled` *is* an attended one, so there's no "completed" button to forget to press. |
| **Feels** | Quietly grateful for the small amount of admin. Nothing to tick after a session that went fine. |

### Frame 11 — A booking made by mistake

| | |
|---|---|
| **Sees** | You booked Thursday against the wrong client. |
| **Does** | Deletes it before it happens. |
| **System** | Delete is allowed only while `scheduled_at > now()`. A future typo disappears so the client never sees a session they weren't booked for; anything in the past can only be `cancelled`. History can't be rewritten. |
| **Feels** | Safe to make ordinary mistakes. |

### Frame 12 — The reschedule request, by email

| | |
|---|---|
| **Sees** | Ola's message: she has a work trip. |
| **Does** | Opens her detail panel, edits the appointment to the following week. |
| **System** | Update is behaviourist-only, and `WITH CHECK` is written out explicitly so `owner_id` can't be rewritten onto a different client. `updated_at` is set by a database trigger, not by the browser. |
| **Feels** | Fine — but you're aware you're the only person who can move a date, which makes you the bottleneck for a task that should be self-service. |

---

## Where the two storyboards disagree

Read side by side, the same three moments show up as friction on both sides:

| Moment | Ola feels | You feel | What's missing |
|---|---|---|---|
| After the contact form (O5 / B1–2) | Sent it into a void | Doing lead admin in your inbox | Autoreply to the sender; lead status in `profile.html` |
| After a booking (O9 / B7) | Only learns by email | Has to announce it by hand | Email on appointment create / change / cancel, via the Resend path that already exists |
| Needing to move a date (O13 / B12) | Falls back to email | Becomes the bottleneck | Client-initiated reschedule *request* — not client write access to `appointments`, which the schema deliberately forbids |

## Backlog implied by the seams

Ordered by how much of the journey each one repairs, not by effort:

1. **Notify on appointment changes.** Create / reschedule / cancel → email the owner. Resend, `MAIL_FROM`, and the templates already exist; the trigger point doesn't.
2. **Client reschedule requests.** A "request a change" action on the owner's appointment that reaches you, leaving the write path behaviourist-only.
3. **Contact-form autoreply.** One email to the sender, echoing their message and stating a realistic response time.
4. **Password reset.** `login.html` has no recovery link at all today — one forgotten password currently ends the relationship.
5. **Private prep notes.** A behaviourist-only column on `appointments`, so client-visible `notes` can stay purely instructional.
6. **Consultation corrections.** Append-only follow-up notes, which keeps immutability intact while making a typo survivable.
7. **Lead pipeline.** Surface `contact_submissions` in the behaviourist view with a handled / not-handled state, so the inbox stops being the system of record.
