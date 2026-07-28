// Synthetic submissions for exercising POST /api/contact.
// Each case documents what it's checking and what the server is expected
// to do, so a mismatch is easy to spot when running the test runner.

module.exports = [
  {
    label: 'valid_full',
    description: 'All fields filled in, including optional phone and the behaviourist checkbox.',
    payload: {
      name: 'Anna Kowalska',
      email: 'anna.kowalska@example.com',
      phone: '+48 601 234 567',
      behaviourist: true,
      message: 'My Sphynx has started overgrooming her belly since we moved apartments. Looking for a consultation.',
    },
    expect: { httpStatus: 200, ok: true },
  },
  {
    label: 'valid_no_phone',
    description: 'Valid submission with the optional phone field omitted entirely.',
    payload: {
      name: 'James Carter',
      email: 'james.carter@example.com',
      behaviourist: false,
      message: 'What proteins should I look for in a Sphynx-specific diet?',
    },
    expect: { httpStatus: 200, ok: true },
  },
  {
    label: 'valid_polish_diacritics',
    description: 'Confirms UTF-8 names/messages with Polish characters pass through untouched.',
    payload: {
      name: 'Łukasz Wiśniewski',
      email: 'lukasz.w@example.com',
      phone: '512-345-678',
      behaviourist: true,
      message: 'Mój kot chowa się i unika kuwety odkąd wzięliśmy drugiego kota. Co robić?',
    },
    expect: { httpStatus: 200, ok: true },
  },
  {
    label: 'missing_name',
    description: 'Name left empty — should fail server-side validation even if the browser check were bypassed.',
    payload: {
      name: '',
      email: 'noname@example.com',
      message: 'Test message with no name.',
    },
    expect: { httpStatus: 400, ok: false },
  },
  {
    label: 'missing_email',
    description: 'Email left empty.',
    payload: {
      name: 'No Email',
      email: '',
      message: 'Test message with no email.',
    },
    expect: { httpStatus: 400, ok: false },
  },
  {
    label: 'invalid_email_format',
    description: 'Malformed email address should be rejected by the server-side regex.',
    payload: {
      name: 'Bad Email',
      email: 'not-an-email',
      message: 'This should be rejected.',
    },
    expect: { httpStatus: 400, ok: false },
  },
  {
    label: 'honeypot_bot',
    description: 'Simulates a bot filling every field, including the hidden "website" honeypot. Server should respond ok:true WITHOUT actually sending an email.',
    payload: {
      name: 'Totally Real Person',
      email: 'bot@example.com',
      message: 'Buy cheap watches now!',
      website: 'http://spam.example',
    },
    expect: { httpStatus: 200, ok: true, emailSent: false },
  },
  {
    label: 'header_injection_attempt',
    description: 'Name field carries a CRLF + fake Bcc header. Server must strip newlines so this cannot inject extra email headers.',
    payload: {
      name: 'Eve\r\nBcc: attacker@evil.example',
      email: 'eve@example.com',
      message: 'Testing header injection resistance.',
    },
    expect: { httpStatus: 200, ok: true },
  },
  {
    label: 'html_script_injection_attempt',
    description: 'Message contains an HTML/script tag. Email is sent as plain text, so this should arrive as inert literal text, not executable markup.',
    payload: {
      name: 'HTML Tester',
      email: 'html@example.com',
      message: '<script>alert("xss")</script> <img src=x onerror=alert(1)>',
    },
    expect: { httpStatus: 200, ok: true },
  },
  {
    label: 'over_length_name',
    description: 'Name is 150 characters; server caps at 100 — should be silently truncated, not rejected.',
    payload: {
      name: 'A'.repeat(150),
      email: 'longname@example.com',
      message: 'Testing name length truncation.',
    },
    expect: { httpStatus: 200, ok: true },
  },
  {
    label: 'message_at_max_length',
    description: 'Message is exactly 2000 characters, the server-side cap.',
    payload: {
      name: 'Max Length',
      email: 'maxlength@example.com',
      message: 'X'.repeat(2000),
    },
    expect: { httpStatus: 200, ok: true },
  },
  {
    label: 'emoji_and_unicode',
    description: 'Message includes emoji and mixed-script unicode to confirm no encoding issues.',
    payload: {
      name: '田中太郎',
      email: 'tanaka@example.com',
      message: 'My Sphynx keeps hiding under blankets — is that normal cold-seeking behaviour? \u{1F431}',
    },
    expect: { httpStatus: 200, ok: true },
  },
];
