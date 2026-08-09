// The synthetic practice: one behaviourist, six clients, their history, their
// schedule, their documents, and a contact-form inbox to work through.
//
// This is what a tester logs into. It exists so the app can be judged as a
// working practice rather than as a set of empty lists — every screen in
// profile.html has something on it, including the ones that are only
// interesting when they are NOT empty (the lead filter, the past/upcoming
// split, the cancelled and no-show badges).
//
// Three rules the cast follows:
//
//   1. Every timestamp is relative to the moment the seed runs, so "upcoming"
//      stays upcoming next month. Nothing here is an absolute date.
//   2. Every id is a fixed constant, so re-seeding updates rows instead of
//      duplicating them, and `--purge` knows exactly what it may delete.
//   3. Everything is addressed at demo.sphynx.guide, which is not a real mail
//      domain. Nothing seeded here can be sent a real email by accident.
//
// No password appears in this file. These are real accounts in whatever
// project gets seeded, so a shared password committed to a public repo is a
// working login handed to everyone — see DEMO_PASSWORD in the seed script.
//
// One owner (Hanna) has deliberately nothing at all: the empty states are a
// real part of the product and they need testing too.

const DEMO_DOMAIN = 'demo.sphynx.guide';

// ---------- time ----------

// The app renders every date in Warsaw time (see the date-echo fields in
// profile.html), so the seed places sessions at Warsaw wall-clock hours —
// otherwise a "10:00 appointment" lands at 10:00 UTC and reads as noon.
function warsawInstant(daysFromNow, hour, minute, now) {
  const day = new Date(now.getTime() + daysFromNow * 86400000);
  const wallClock = Date.UTC(
    day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, minute, 0,
  );
  // Two passes: the first offset is looked up at the wrong instant whenever
  // the guess falls on the other side of a DST change, the second is not.
  let instant = wallClock - warsawOffsetMs(new Date(wallClock));
  instant = wallClock - warsawOffsetMs(new Date(instant));
  return new Date(instant).toISOString();
}

function warsawOffsetMs(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Warsaw',
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second),
  );
  return asUtc - date.getTime();
}

// ---------- the practice ----------

const BEHAVIOURIST = {
  key: 'marta',
  email: `marta.zielinska@${DEMO_DOMAIN}`,
  fullName: 'Marta Zielińska',
  note: 'The single behaviourist account. Sees every client, the whole schedule, and the leads.',
};

const CLINIC_ADDRESS = 'ul. Koszykowa 42/3, 00-672 Warszawa';
const MEET_URL = 'https://meet.example.com/sphynx-demo';

const OWNERS = [
  {
    key: 'anna',
    email: `anna.kowalska@${DEMO_DOMAIN}`,
    fullName: 'Anna Kowalska',
    // What a tester should be able to see by logging in as this account.
    shows: 'The full arc: three logged consultations, two attended sessions, '
      + 'two upcoming ones, and documents from both sides.',
    appointments: [
      {
        id: 'de70a001-0000-4000-8000-000000000001',
        days: -21, hour: 10, minute: 0, durationMinutes: 90, mode: 'in_person',
        status: 'scheduled', location: CLINIC_ADDRESS,
        notes: 'Bring the feeding diary from the last two weeks. / Proszę przynieść dzienniczek karmienia z ostatnich dwóch tygodni.',
      },
      {
        id: 'de70a001-0000-4000-8000-000000000002',
        days: -7, hour: 17, minute: 30, durationMinutes: 60, mode: 'online',
        status: 'scheduled', location: MEET_URL,
        notes: 'Follow-up on the overgrooming plan. Have Mruczek in the room if you can.',
      },
      {
        id: 'de70a001-0000-4000-8000-000000000003',
        days: 3, hour: 11, minute: 0, durationMinutes: 60, mode: 'online',
        status: 'scheduled', location: MEET_URL,
        notes: 'Third check-in. We will look at whether the belly fur is growing back.',
      },
      {
        id: 'de70a001-0000-4000-8000-000000000004',
        days: 24, hour: 9, minute: 30, durationMinutes: 90, mode: 'in_person',
        status: 'scheduled', location: CLINIC_ADDRESS,
        notes: 'Monthly review in the practice. Carrier, not a harness — the corridor is busy.',
      },
    ],
    consultations: [
      {
        id: 'de70c001-0000-4000-8000-000000000001',
        days: -84, hour: 18, mode: 'online',
        notes: 'First session after the move. Overgrooming of the belly started within a week of '
          + 'changing apartments. Ruled out a new detergent and a change of food. Working '
          + 'hypothesis is stress from the loss of the old vertical territory: the previous flat '
          + 'had a windowsill perch, the new one has none. Agreed on two cat shelves by the '
          + 'window and a two-week photo diary of the belly.',
      },
      {
        id: 'de70c001-0000-4000-8000-000000000002',
        days: -56, hour: 17, mode: 'online',
        notes: 'Shelves are up and used daily. Overgrooming down from most evenings to roughly '
          + 'twice a week, both times after Anna returns late. Added a predictable pre-bed '
          + 'routine: play, then feed, then lights down, in that order every evening.',
      },
      {
        id: 'de70c001-0000-4000-8000-000000000003',
        days: -21, hour: 10, mode: 'in_person',
        notes: 'Seen in the practice. Skin is calm, no lesions, regrowth visible on the left '
          + 'flank. Weight 3.9 kg, up 120 g since the first session. Advised keeping the routine '
          + 'through the winter heating season and photographing the belly monthly rather than '
          + 'weekly — the daily checks were themselves becoming a source of handling stress.',
      },
    ],
    documents: [
      {
        id: 'de70d001-0000-4000-8000-000000000001',
        category: 'behaviourist_advice',
        uploadedBy: 'behaviourist',
        fileName: 'Plan-postepowania-Mruczek.pdf',
        mimeType: 'application/pdf',
        file: {
          kind: 'pdf',
          title: 'Plan postepowania - Mruczek (Anna Kowalska)',
          lines: [
            'Sporządzony po pierwszej konsultacji online. Dokument demonstracyjny.',
            '',
            '1. Territory. Two wall shelves by the south window, 60 cm apart, reachable in one jump from the sofa arm.',
            '2. Evening routine. Play (10 min, wand toy), then the main meal, then dim the lights. Same order daily.',
            '3. Diary. Photograph the belly once a week, same light, same angle. Bring the photos to the next session.',
            '4. What NOT to do. Do not interrupt grooming by picking the cat up — it makes handling itself aversive.',
            '',
            'Next review: after two weeks, online.',
          ],
        },
      },
      {
        id: 'de70d001-0000-4000-8000-000000000002',
        category: 'image',
        uploadedBy: 'owner',
        fileName: 'mruczek-ulubione-miejsce.png',
        mimeType: 'image/png',
        file: { kind: 'png', pattern: 'warmth', width: 480, height: 320 },
      },
      {
        id: 'de70d001-0000-4000-8000-000000000003',
        category: 'medical',
        uploadedBy: 'owner',
        fileName: 'wyniki-badan-skornych.pdf',
        mimeType: 'application/pdf',
        file: {
          kind: 'pdf',
          title: 'Wyniki badan skornych - Mruczek',
          lines: [
            'Przychodnia weterynaryjna (dane demonstracyjne).',
            '',
            'Skin scrape: negative for Demodex and Notoedres.',
            'Fungal culture: negative at 14 days.',
            'Allergy panel: no reaction to the tested environmental panel.',
            '',
            'Conclusion: no dermatological cause found for the belly hair loss. Behavioural referral advised.',
          ],
        },
      },
    ],
  },

  {
    key: 'james',
    email: `james.carter@${DEMO_DOMAIN}`,
    fullName: 'James Carter',
    shows: 'A client who has booked but not yet been seen: one upcoming session, '
      + 'no history, no documents. The "nothing has happened yet" state.',
    appointments: [
      {
        id: 'de70a002-0000-4000-8000-000000000001',
        days: 2, hour: 19, minute: 0, durationMinutes: 60, mode: 'online',
        status: 'scheduled', location: MEET_URL,
        notes: 'First session. Please have the current food packaging to hand.',
      },
    ],
    consultations: [],
    documents: [],
  },

  {
    key: 'lukasz',
    email: `lukasz.wisniewski@${DEMO_DOMAIN}`,
    fullName: 'Łukasz Wiśniewski',
    shows: 'The untidy case: an attended session, a no-show, an upcoming one, and a '
      + 'cancelled future session that the client can still see was called off.',
    appointments: [
      {
        id: 'de70a003-0000-4000-8000-000000000001',
        days: -35, hour: 16, minute: 0, durationMinutes: 90, mode: 'in_person',
        status: 'scheduled', location: CLINIC_ADDRESS,
        notes: 'Both cats, separate carriers.',
      },
      {
        id: 'de70a003-0000-4000-8000-000000000002',
        days: -14, hour: 16, minute: 0, durationMinutes: 60, mode: 'in_person',
        status: 'no_show', location: CLINIC_ADDRESS,
        notes: 'Follow-up on the introduction plan.',
      },
      {
        id: 'de70a003-0000-4000-8000-000000000003',
        days: 9, hour: 18, minute: 30, durationMinutes: 60, mode: 'online',
        status: 'scheduled', location: MEET_URL,
        notes: 'Rebooked after the missed session. Online this time — no travel needed.',
      },
      {
        id: 'de70a003-0000-4000-8000-000000000004',
        days: 16, hour: 18, minute: 30, durationMinutes: 60, mode: 'online',
        status: 'cancelled', location: MEET_URL,
        notes: 'Cancelled — merged into the session a week earlier.',
      },
    ],
    consultations: [
      {
        id: 'de70c003-0000-4000-8000-000000000001',
        days: -35, hour: 16, mode: 'in_person',
        notes: 'Dwa koty, wprowadzenie drugiego kota trzy tygodnie temu. Kot pierwszy (Bonifacy) '
          + 'chowa się pod łóżkiem i unika kuwety w korytarzu. Ustalono: rozdzielenie zasobów '
          + '(trzecia kuweta, druga miska), wymiana zapachów przez tydzień, karmienie po dwóch '
          + 'stronach zamkniętych drzwi, dopiero potem kontakt wzrokowy przez siatkę.',
      },
      {
        id: 'de70c003-0000-4000-8000-000000000002',
        days: -21, hour: 17, mode: 'online',
        notes: 'Krótka konsultacja telefoniczna zamiast wizyty. Bonifacy korzysta z nowej kuwety, '
          + 'nadal syczy przy karmieniu. Zalecono spowolnienie tempa — powrót do etapu karmienia '
          + 'przy zamkniętych drzwiach na kolejne dziesięć dni.',
      },
    ],
    documents: [
      {
        id: 'de70d003-0000-4000-8000-000000000001',
        category: 'behaviourist_advice',
        uploadedBy: 'behaviourist',
        fileName: 'introduction-plan-two-cats.pdf',
        mimeType: 'application/pdf',
        file: {
          kind: 'pdf',
          title: 'Introducing a second cat - staged plan',
          lines: [
            'Prepared for Lukasz Wisniewski. Demonstration document.',
            '',
            'Stage 1 (days 1-7). Full separation. Swap bedding daily so each cat learns the other\'s scent.',
            'Stage 2 (days 8-14). Feed both cats at the same time on opposite sides of a closed door.',
            'Stage 3 (days 15-21). Visual contact through a mesh barrier, five minutes, twice daily.',
            'Stage 4. Short supervised contact, ending BEFORE either cat tenses.',
            '',
            'Resources: three litter trays, two feeding stations, two elevated resting places.',
            'If any stage produces hissing on two consecutive days, return to the previous stage.',
          ],
        },
      },
      {
        id: 'de70d003-0000-4000-8000-000000000002',
        category: 'image',
        uploadedBy: 'owner',
        fileName: 'uklad-mieszkania.png',
        mimeType: 'image/png',
        file: { kind: 'png', pattern: 'layout', width: 480, height: 336 },
      },
    ],
  },

  {
    key: 'sofia',
    email: `sofia.bianchi@${DEMO_DOMAIN}`,
    fullName: 'Sofia Bianchi',
    shows: 'An online-only client whose documents were all uploaded by the owner, '
      + 'not the behaviourist.',
    appointments: [
      {
        id: 'de70a004-0000-4000-8000-000000000001',
        days: -10, hour: 20, minute: 0, durationMinutes: 60, mode: 'online',
        status: 'scheduled', location: MEET_URL,
        notes: 'Evening slot to fit the time difference.',
      },
      {
        id: 'de70a004-0000-4000-8000-000000000002',
        days: 5, hour: 20, minute: 0, durationMinutes: 45, mode: 'online',
        status: 'scheduled', location: MEET_URL,
        notes: 'Short follow-up. Please send the weight log the day before.',
      },
    ],
    consultations: [
      {
        id: 'de70c004-0000-4000-8000-000000000001',
        days: -10, hour: 20, mode: 'online',
        notes: 'Sphynx, 14 months, refusing the heated bed and sleeping under the duvet instead. '
          + 'No medical concern — the behaviour is normal heat-seeking. Reassurance given. The '
          + 'real issue was the owner being woken nightly: agreed on a heated bed moved beside '
          + 'the pillow rather than at the foot of the bed, so the warm spot competes.',
      },
    ],
    documents: [
      {
        id: 'de70d004-0000-4000-8000-000000000001',
        // The 'recording' category needs a row or it never renders, and the
        // bucket's video mime types are the one kind of file this seed cannot
        // honestly synthesise — so it is the written-up transcript of one,
        // which is a real thing a client uploads.
        category: 'recording',
        uploadedBy: 'owner',
        fileName: 'night-camera-transcript.pdf',
        mimeType: 'application/pdf',
        file: {
          kind: 'pdf',
          title: 'Night camera recording - what it showed, two weeks',
          lines: [
            'Written up by Sofia Bianchi from the bedroom camera. Demonstration document.',
            '',
            'Week 1: under the duvet by 23:00 on six of seven nights. Woke the household twice.',
            'Week 2: heated bed moved beside the pillow. Used it on four nights, duvet on three.',
            '',
            'Weight: 3.4 kg on day 1, 3.45 kg on day 14.',
          ],
        },
      },
      {
        id: 'de70d004-0000-4000-8000-000000000002',
        category: 'other',
        uploadedBy: 'owner',
        fileName: 'weight-log.png',
        mimeType: 'image/png',
        file: { kind: 'png', pattern: 'chart', width: 512, height: 288 },
      },
    ],
  },

  {
    key: 'piotr',
    email: `piotr.nowak@${DEMO_DOMAIN}`,
    fullName: 'Piotr Nowak',
    shows: 'A dormant client: history only, nothing upcoming. Checks that the '
      + '"no upcoming sessions" empty state coexists with a full past list.',
    appointments: [
      {
        id: 'de70a005-0000-4000-8000-000000000001',
        days: -180, hour: 12, minute: 0, durationMinutes: 90, mode: 'in_person',
        status: 'scheduled', location: CLINIC_ADDRESS,
        notes: 'Initial assessment.',
      },
      {
        id: 'de70a005-0000-4000-8000-000000000002',
        days: -150, hour: 12, minute: 0, durationMinutes: 60, mode: 'in_person',
        status: 'scheduled', location: CLINIC_ADDRESS,
        notes: 'Closing session.',
      },
    ],
    consultations: [
      {
        id: 'de70c005-0000-4000-8000-000000000001',
        days: -180, hour: 12, mode: 'in_person',
        notes: 'Litter tray avoidance after a house move. Tray had been placed next to the '
          + 'washing machine. Moved to a quiet corner, switched to unscented litter, avoidance '
          + 'stopped within four days.',
      },
      {
        id: 'de70c005-0000-4000-8000-000000000002',
        days: -150, hour: 12, mode: 'in_person',
        notes: 'Closing session. No recurrence in four weeks. Case closed; owner knows to get in '
          + 'touch if the behaviour returns after the next move.',
      },
    ],
    documents: [
      {
        id: 'de70d005-0000-4000-8000-000000000001',
        category: 'behaviourist_advice',
        uploadedBy: 'behaviourist',
        fileName: 'litter-tray-checklist.pdf',
        mimeType: 'application/pdf',
        file: {
          kind: 'pdf',
          title: 'Litter tray checklist',
          lines: [
            'Prepared for Piotr Nowak. Demonstration document.',
            '',
            'One tray per cat, plus one. Never beside an appliance that starts on its own.',
            'Unscented litter, 4 cm deep. Scoop daily, full change weekly.',
            'No covered trays during an avoidance problem: they trap smell and remove escape routes.',
            'If avoidance returns, photograph WHERE the cat goes instead — the location is the diagnosis.',
          ],
        },
      },
    ],
  },

  {
    key: 'hanna',
    email: `hanna.dabrowska@${DEMO_DOMAIN}`,
    fullName: 'Hanna Dąbrowska',
    shows: 'Signed up, never seen. Nothing at all — this is the account to open '
      + 'when testing the empty states and the first upload.',
    appointments: [],
    consultations: [],
    documents: [],
  },
];

// ---------- the contact-form inbox ----------
//
// contact_submissions is behaviourist-only (sql/006), and every one of the
// four statuses needs a row or the lead filter has nothing to filter. `days`
// is how long ago the enquiry arrived; `handled` marks the rows the trigger
// would have stamped with who dealt with them.

const LEADS = [
  {
    id: 'de70e001-0000-4000-8000-000000000001',
    days: -0.4, name: 'Marek Adamczyk', email: 'marek.adamczyk@example.com',
    phone: '+48 604 118 220', behaviourist: true,
    message: 'Nasza sfinksiara od dwóch tygodni budzi nas o 4 rano i miauczy pod drzwiami sypialni. '
      + 'Próbowaliśmy późnej kolacji, bez skutku. Czy da się umówić konsultację online w tym tygodniu?',
    status: 'new',
  },
  {
    id: 'de70e001-0000-4000-8000-000000000002',
    days: -1.2, name: 'Rachel Owens', email: 'rachel.owens@example.com',
    behaviourist: true,
    message: 'We are adopting a 3-year-old Sphynx next month and already have a nervous older cat. '
      + 'Could we book a session BEFORE the adoption rather than after it goes wrong?',
    status: 'new',
  },
  {
    id: 'de70e001-0000-4000-8000-000000000003',
    days: -2.5, name: 'Katarzyna Lis', email: 'k.lis@example.com',
    phone: '512 660 041', behaviourist: false,
    message: 'Pytanie do poradnika: jaka temperatura w mieszkaniu jest bezpieczna dla sfinksa zimą? '
      + 'Mamy 19 stopni i kot ciągle szuka kaloryfera.',
    status: 'new',
  },
  {
    id: 'de70e001-0000-4000-8000-000000000004',
    days: -4, name: '田中太郎', email: 'tanaka@example.com',
    behaviourist: false,
    message: 'My Sphynx keeps hiding under blankets — is that normal cold-seeking behaviour? 🐱',
    status: 'new',
  },
  {
    id: 'de70e001-0000-4000-8000-000000000005',
    days: -6, name: 'Tomasz Górski', email: 'tomasz.gorski@example.com',
    phone: '+48 691 004 512', behaviourist: true,
    message: 'Kot drapie ściany w korytarzu, drapak stoi w salonie i jest ignorowany. '
      + 'Chętnie umówię się na wizytę w gabinecie.',
    status: 'contacted',
    internalNote: 'Odpisałam z trzema terminami — czeka na potwierdzenie. Jeśli nie odpisze do piątku, przypomnieć.',
    handled: true,
  },
  {
    id: 'de70e001-0000-4000-8000-000000000006',
    days: -8, name: 'Elena Novak', email: 'elena.novak@example.com',
    behaviourist: true,
    message: 'Our Sphynx has started biting during play and my son is getting scratched. '
      + 'How soon could you see us?',
    status: 'contacted',
    internalNote: 'Child in the household — asked for video of a play session before booking. '
      + 'If the biting is redirected play aggression this may not need an in-person visit.',
    handled: true,
  },
  {
    id: 'de70e001-0000-4000-8000-000000000007',
    days: -14, name: 'Sofia Bianchi', email: 'sofia.bianchi@example.com',
    behaviourist: true,
    message: 'Our cat refuses the heated bed we bought and sleeps under the duvet instead. '
      + 'Is that something to worry about?',
    status: 'converted',
    internalNote: 'Became a client — first online session held, follow-up booked. Nothing medical.',
    handled: true,
  },
  {
    id: 'de70e001-0000-4000-8000-000000000008',
    days: -30, name: 'Anna Kowalska', email: 'anna.kowalska@example.com',
    phone: '+48 601 234 567', behaviourist: true,
    message: 'My Sphynx has started overgrooming her belly since we moved apartments. '
      + 'Looking for a consultation.',
    status: 'converted',
    internalNote: 'Long-running case, three sessions logged. The original enquiry that started it.',
    handled: true,
  },
  {
    id: 'de70e001-0000-4000-8000-000000000009',
    days: -18, name: 'Totally Real Person', email: 'offers@example.com',
    behaviourist: false,
    message: 'GREAT OFFER!!! Premium backlinks for your website, first month free, reply now!!!',
    status: 'archived',
    internalNote: 'Spam. Got past the honeypot because it was typed by a human, not a bot.',
    handled: true,
  },
  {
    id: 'de70e001-0000-4000-8000-000000000010',
    days: -22, name: 'Grzegorz Pawlak', email: 'g.pawlak@example.com',
    behaviourist: false,
    message: 'Czy prowadzi Pani hodowlę? Szukam kociaka sfinksa.',
    status: 'archived',
    internalNote: 'Nie hodowla — odesłałam do sekcji o wyborze hodowli w poradniku.',
    handled: true,
  },
];

// Resolves every relative offset against a single `now`, so one seed run
// produces one internally consistent timeline.
function buildDataset(now = new Date()) {
  return {
    behaviourist: BEHAVIOURIST,
    owners: OWNERS.map((owner) => ({
      ...owner,
      appointments: owner.appointments.map((appointment) => ({
        ...appointment,
        scheduled_at: warsawInstant(appointment.days, appointment.hour, appointment.minute, now),
      })),
      consultations: owner.consultations.map((consultation) => ({
        ...consultation,
        consultation_date: warsawInstant(consultation.days, consultation.hour, 0, now),
      })),
    })),
    leads: LEADS.map((lead) => ({
      ...lead,
      created_at: new Date(now.getTime() + lead.days * 86400000).toISOString(),
    })),
  };
}

module.exports = { DEMO_DOMAIN, BEHAVIOURIST, OWNERS, LEADS, buildDataset };
