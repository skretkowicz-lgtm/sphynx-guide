#!/usr/bin/env node
// Fires the synthetic cases in ../test-data/contact-submissions.js at a
// running server's POST /api/contact.
//
// Defaults to a dry run (prints what would be sent, makes no requests).
// Pass --live to actually send requests.
//
// Usage:
//   node scripts/test-contact-form.js                  # dry run, all cases
//   node scripts/test-contact-form.js --live            # live, all cases
//   node scripts/test-contact-form.js --live --limit=5  # live, first 5 only
//   node scripts/test-contact-form.js --live --only=honeypot_bot,valid_full
//
// Valid cases send a REAL email through whatever SMTP account is
// configured in .env. The server also rate-limits /api/contact to 5
// requests per 10 minutes per IP, so a full --live run of all 13 cases
// will show 429s after the 5th request — that's the rate limiter working
// as intended, not a bug in the test.

const allCases = require('../test-data/contact-submissions');

const args = process.argv.slice(2);
const LIVE = args.includes('--live');
const limitArg = args.find((arg) => arg.startsWith('--limit='));
const onlyArg = args.find((arg) => arg.startsWith('--only='));
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : undefined;
const ONLY = onlyArg ? onlyArg.split('=')[1].split(',') : undefined;

const TARGET = process.env.TEST_TARGET || 'http://localhost:3000/api/contact';
const DELAY_MS = 1200;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function selectCases() {
  let cases = allCases;
  if (ONLY) cases = cases.filter((testCase) => ONLY.includes(testCase.label));
  if (LIMIT) cases = cases.slice(0, LIMIT);
  return cases;
}

async function runCase(testCase) {
  if (!LIVE) {
    console.log(`  [dry-run] would POST: ${JSON.stringify(testCase.payload)}`);
    console.log(`  [dry-run] expects: HTTP ${testCase.expect.httpStatus}, ok:${testCase.expect.ok}`);
    return;
  }

  try {
    const res = await fetch(TARGET, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testCase.payload),
    });
    const body = await res.json().catch(() => ({}));
    const passed = res.status === testCase.expect.httpStatus && body.ok === testCase.expect.ok;
    console.log(`  ${passed ? 'PASS' : 'FAIL'}  got HTTP ${res.status}, ok:${body.ok}  (expected HTTP ${testCase.expect.httpStatus}, ok:${testCase.expect.ok})`);
    if (!passed) console.log(`        response: ${JSON.stringify(body)}`);
  } catch (err) {
    console.log(`  ERROR  ${err.message}`);
  }
}

(async () => {
  const cases = selectCases();
  console.log(`Target: ${TARGET}`);
  console.log(LIVE
    ? 'Mode: LIVE — real requests will be sent. Valid cases WILL send a real email.'
    : 'Mode: DRY RUN — no requests sent. Pass --live to actually send them.');
  console.log(`Cases: ${cases.length} of ${allCases.length}`);
  console.log('---');

  for (const testCase of cases) {
    console.log(`\n${testCase.label} — ${testCase.description}`);
    await runCase(testCase);
    if (LIVE) await sleep(DELAY_MS);
  }
})();
