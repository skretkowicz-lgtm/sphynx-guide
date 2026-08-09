#!/usr/bin/env node
// Loads the synthetic practice in ../test-data/demo-dataset.js into Supabase,
// so a tester can sign in and see the app with a year of history behind it.
//
// Defaults to a dry run (prints the plan, writes nothing), same as
// test-contact-form.js. Pass --live to actually write.
//
// Usage:
//   node server/scripts/seed-demo-data.js            # dry run: show the plan
//   node server/scripts/seed-demo-data.js --live     # create/refresh the demo data
//   node server/scripts/seed-demo-data.js --purge    # dry run of the deletion
//   node server/scripts/seed-demo-data.js --purge --live   # delete it all again
//
// Uses SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from server/.env — the
// service_role key bypasses RLS, which is the only way to create auth users,
// promote the behaviourist, and write rows on behalf of six different people.
// Nothing in here belongs anywhere near the browser.
//
// The shared password comes from DEMO_PASSWORD in the same .env, and is
// deliberately not in the repo. These accounts are real: the behaviourist one
// can read every genuine client's consultations, documents and leads, so a
// password committed here would be a working login to a live practice,
// published to anyone who reads the repo.
//
// Safe to run repeatedly: every seeded row has a fixed id and is upserted,
// and accounts are matched by address, so a second run refreshes the timeline
// instead of duplicating the practice. --purge only ever touches those same
// fixed ids and the @demo.sphynx.guide accounts, so it cannot take real data
// with it.

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { DEMO_DOMAIN, buildDataset } = require('../test-data/demo-dataset');
const { renderFile } = require('../test-data/demo-files');

const args = process.argv.slice(2);
const LIVE = args.includes('--live');
const PURGE = args.includes('--purge');
const BUCKET = 'consultation-documents';

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingEnv.length) {
  console.error(`Missing required environment variables: ${missingEnv.join(', ')}`);
  console.error('Copy server/.env.example to server/.env and fill in your Supabase details.');
  process.exit(1);
}

const DEMO_PASSWORD = process.env.DEMO_PASSWORD;

// Refused rather than defaulted: a fallback password in the source is the
// exact thing this variable exists to avoid, and it would be the one everyone
// ends up using. Purging needs no password, so the check lives here.
function requireDemoPassword() {
  if (DEMO_PASSWORD) return;
  console.error('DEMO_PASSWORD is not set — seeding would have to invent a password');
  console.error('and print it, which is how a shared login ends up in a screenshot.\n');
  console.error('Add a line like this to server/.env (it is gitignored), then re-run:\n');
  console.error(`  DEMO_PASSWORD=${crypto.randomBytes(15).toString('base64url')}\n`);
  console.error('Share it with testers out of band. Re-running the seed resets every');
  console.error('demo account to whatever it says, so rotating it is one edit and one run.');
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Same rule profile.html applies before uploading, so a seeded path looks
// exactly like one the app would have produced.
function sanitizeFilename(name) {
  return String(name).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-100);
}

function storagePathFor(ownerId, doc) {
  return `${ownerId}/${doc.id}/${sanitizeFilename(doc.fileName)}`;
}

function fail(context, error) {
  console.error(`\n  ✗ ${context}: ${error.message || error}`);
  process.exit(1);
}

function check(context, result) {
  if (result && result.error) fail(context, result.error);
  return result;
}

// ---------- accounts ----------

// listUsers has no filter-by-email, so the page walk is the lookup. The demo
// practice is seven accounts; a project with thousands of real users still
// only pays this once per run.
async function findUserByEmail(email) {
  const wanted = email.toLowerCase();
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail('listing existing accounts', error);
    const found = (data.users || []).find((user) => (user.email || '').toLowerCase() === wanted);
    if (found) return found;
    if ((data.users || []).length < 200) return null;
  }
  return null;
}

// The profiles row is created by the on_auth_user_created trigger, never by
// this script — seeding it directly would test a path signup does not use.
async function ensureAccount(person, role) {
  const existing = await findUserByEmail(person.email);
  let user = existing;

  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: person.email,
      password: DEMO_PASSWORD,
      // No confirmation mail: demo.sphynx.guide does not receive mail, and a
      // tester should not have to click a link that will never arrive.
      email_confirm: true,
      user_metadata: { full_name: person.fullName },
    });
    if (error) fail(`creating ${person.email}`, error);
    user = data.user;
  } else {
    // Reset the password on every run, so a tester who changed it during
    // testing gets the documented one back.
    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: person.fullName },
    });
    if (error) fail(`refreshing ${person.email}`, error);
  }

  // full_name only reaches profiles via the trigger's raw_user_meta_data read
  // at signup, so an account that existed before this dataset did needs it
  // written here. The role update is the scripted form of the manual
  // promotion in README.md — it works for the same reason: auth.uid() is null
  // for the service_role key, so prevent_role_escalation lets it through.
  check(`setting up the profile for ${person.email}`, await supabase
    .from('profiles')
    .update({ full_name: person.fullName, role })
    .eq('id', user.id));

  return user.id;
}

// ---------- seeding ----------

async function seed() {
  const dataset = buildDataset(new Date());

  const behaviouristId = await ensureAccount(dataset.behaviourist, 'behaviourist');
  console.log(`  behaviourist  ${dataset.behaviourist.email}`);

  const appointments = [];
  const consultations = [];
  const documents = [];
  const uploads = [];

  for (const owner of dataset.owners) {
    const ownerId = await ensureAccount(owner, 'owner');
    console.log(`  owner         ${owner.email}`);

    owner.appointments.forEach((appointment) => {
      appointments.push({
        id: appointment.id,
        owner_id: ownerId,
        scheduled_at: appointment.scheduled_at,
        duration_minutes: appointment.durationMinutes,
        mode: appointment.mode,
        status: appointment.status,
        location: appointment.location,
        notes: appointment.notes,
        created_by: behaviouristId,
      });
    });

    owner.consultations.forEach((consultation) => {
      consultations.push({
        id: consultation.id,
        owner_id: ownerId,
        consultation_date: consultation.consultation_date,
        mode: consultation.mode,
        notes: consultation.notes,
        created_by: behaviouristId,
      });
    });

    owner.documents.forEach((doc) => {
      const storagePath = storagePathFor(ownerId, doc);
      documents.push({
        id: doc.id,
        owner_id: ownerId,
        uploaded_by: doc.uploadedBy === 'behaviourist' ? behaviouristId : ownerId,
        storage_path: storagePath,
        file_name: doc.fileName,
        mime_type: doc.mimeType,
        category: doc.category,
      });
      uploads.push({ path: storagePath, contentType: doc.mimeType, spec: doc.file });
    });
  }

  // Files first: a documents row whose object is missing is a broken download
  // link, which is worse than a document that is not listed yet.
  for (const upload of uploads) {
    const { error } = await supabase.storage.from(BUCKET).upload(
      upload.path, renderFile(upload.spec),
      { contentType: upload.contentType, upsert: true },
    );
    if (error) fail(`uploading ${upload.path}`, error);
  }
  console.log(`  uploaded      ${uploads.length} files to ${BUCKET}`);

  check('writing appointments', await supabase.from('appointments').upsert(appointments));
  console.log(`  appointments  ${appointments.length}`);

  check('writing consultations', await supabase.from('consultations').upsert(consultations));
  console.log(`  consultations ${consultations.length}`);

  check('writing documents', await supabase.from('documents').upsert(documents));
  console.log(`  documents     ${documents.length}`);

  // handled_by/handled_at are normally stamped by the trigger in sql/006 from
  // auth.uid(), which is null for this key — so the seed sets them outright.
  // That is only possible here because the trigger fires on UPDATE, and these
  // rows arrive as inserts carrying their final status.
  const leads = dataset.leads.map((lead) => ({
    id: lead.id,
    created_at: lead.created_at,
    name: lead.name,
    email: lead.email,
    phone: lead.phone || null,
    behaviourist: Boolean(lead.behaviourist),
    message: lead.message,
    status: lead.status,
    internal_note: lead.internalNote || null,
    handled_by: lead.handled ? behaviouristId : null,
    handled_at: lead.handled ? lead.created_at : null,
  }));
  check('writing contact submissions', await supabase.from('contact_submissions').upsert(leads));
  console.log(`  leads         ${leads.length}`);
}

// ---------- purging ----------

// Everything under a demo owner's storage prefix goes, not just the seeded
// paths: anything a tester uploaded while testing belongs to an account that
// is about to stop existing.
async function listAllUnder(prefix) {
  const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (error) fail(`listing ${prefix}`, error);
  const paths = [];
  for (const entry of data || []) {
    const full = `${prefix}/${entry.name}`;
    // Storage has no directories; an entry with no id is a synthesised folder.
    if (entry.id) paths.push(full);
    else paths.push(...await listAllUnder(full));
  }
  return paths;
}

async function purge() {
  const dataset = buildDataset(new Date());
  const people = [dataset.behaviourist, ...dataset.owners];

  const userIds = [];
  for (const person of people) {
    const user = await findUserByEmail(person.email);
    if (user) userIds.push({ email: person.email, id: user.id });
  }

  let objectPaths = [];
  for (const user of userIds) {
    objectPaths = objectPaths.concat(await listAllUnder(user.id));
  }
  if (objectPaths.length) {
    const { error } = await supabase.storage.from(BUCKET).remove(objectPaths);
    if (error) fail('removing stored files', error);
  }
  console.log(`  removed       ${objectPaths.length} stored files`);

  // documents and consultations reference profiles without ON DELETE CASCADE
  // (deliberately — sql/005 explains why), so they have to go before the
  // accounts do. appointments would cascade, but deleting them by id keeps
  // the purge honest about what it removed.
  const byOwner = userIds.map((user) => user.id);
  for (const table of ['documents', 'consultations', 'appointments']) {
    if (!byOwner.length) break;
    const { error, count } = await supabase.from(table).delete({ count: 'exact' })
      .in('owner_id', byOwner);
    if (error) fail(`deleting ${table}`, error);
    console.log(`  ${table.padEnd(14)}${count} deleted`);
  }

  const { error: leadError, count: leadCount } = await supabase
    .from('contact_submissions').delete({ count: 'exact' })
    .in('id', dataset.leads.map((lead) => lead.id));
  if (leadError) fail('deleting contact submissions', leadError);
  console.log(`  leads         ${leadCount} deleted`);

  for (const user of userIds) {
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) fail(`deleting ${user.email}`, error);
    console.log(`  account       ${user.email} deleted`);
  }
}

// ---------- dry run ----------

function describe() {
  const dataset = buildDataset(new Date());
  const when = (iso) => new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Europe/Warsaw', dateStyle: 'medium', timeStyle: 'short',
  });

  console.log(`Behaviourist\n  ${dataset.behaviourist.fullName} <${dataset.behaviourist.email}>`);
  console.log(`  ${dataset.behaviourist.note}\n`);

  dataset.owners.forEach((owner) => {
    console.log(`${owner.fullName} <${owner.email}>`);
    console.log(`  ${owner.shows}`);
    const upcoming = owner.appointments.filter((a) => new Date(a.scheduled_at) >= new Date());
    console.log(`  appointments  ${owner.appointments.length} (${upcoming.length} upcoming)`);
    owner.appointments.forEach((appointment) => {
      console.log(`    ${when(appointment.scheduled_at)}  ${appointment.mode.padEnd(9)} ${appointment.status}`);
    });
    console.log(`  consultations ${owner.consultations.length}`);
    console.log(`  documents     ${owner.documents.length}`);
    console.log('');
  });

  const byStatus = dataset.leads.reduce((acc, lead) => {
    acc[lead.status] = (acc[lead.status] || 0) + 1;
    return acc;
  }, {});
  console.log('Contact-form leads');
  Object.keys(byStatus).forEach((status) => console.log(`  ${status.padEnd(10)} ${byStatus[status]}`));
}

// ---------- run ----------

async function main() {
  const host = new URL(process.env.SUPABASE_URL).host;
  const action = PURGE ? 'PURGE' : 'SEED';

  console.log(`\n${action} demo data — ${host}`);
  console.log(LIVE ? 'Mode: LIVE (this writes to the database)\n' : 'Mode: dry run (nothing is written)\n');

  if (!LIVE) {
    if (PURGE) {
      const dataset = buildDataset(new Date());
      console.log('Would delete these accounts, and every appointment, consultation,');
      console.log('document and stored file belonging to them:\n');
      [dataset.behaviourist, ...dataset.owners].forEach((person) => console.log(`  ${person.email}`));
      console.log(`\nAnd ${dataset.leads.length} seeded contact_submissions rows, by id.`);
    } else {
      describe();
    }
    console.log(`\nRe-run with --live to apply. Target: ${host}`);
    if (!PURGE && !DEMO_PASSWORD) {
      console.log('\nNote: DEMO_PASSWORD is not set in server/.env — a live run will stop and say so.');
    }
    return;
  }

  if (PURGE) {
    await purge();
  } else {
    requireDemoPassword();
    await seed();
  }

  if (!PURGE) {
    console.log('\nDone. Every seeded account signs in with DEMO_PASSWORD from server/.env.');
    console.log(`Behaviourist view: marta.zielinska@${DEMO_DOMAIN}`);
    console.log('Owner view:        any of the addresses above.');
  } else {
    console.log('\nDone. The demo practice is gone.');
  }
}

main().catch((error) => {
  console.error(`\nFailed: ${error && error.message ? error.message : error}`);
  process.exit(1);
});
