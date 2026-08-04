// Outbound mail, in one place.
//
// Mail goes over Resend's HTTPS API rather than SMTP: Railway (like most
// hosts) blocks outbound SMTP ports to deter spam, so a direct
// smtp.gmail.com connection hangs until it times out. Port 443 always works,
// and using the same path locally keeps dev and prod identical.
//
// Note this is only true of mail the *app* sends. Supabase's auth mail
// (signup confirmation, password recovery) leaves Supabase's own
// infrastructure, so it is configured as SMTP in the Supabase dashboard and
// never passes through here.

const { Resend } = require('resend');

// Every message the site sends goes to one person about one thing, so the
// language is a property of the message, not of the transport. Where the
// recipient's language is unknown, send both halves rather than guessing:
// profiles has no language column, and a wrong guess is worse than a long
// email.
const DIVIDER = '\n\n' + '—'.repeat(32) + '\n\n';

function bilingual(en, pl) {
  return en + DIVIDER + pl;
}

// Subjects are the one place both languages have to share a single line.
function bilingualSubject(en, pl) {
  return en + ' / ' + pl;
}

function createMailer(options) {
  const resend = new Resend(options.apiKey);
  const from = options.from;

  // Resend reports failures as { error } rather than by rejecting, so both
  // shapes are normalised into one value: null on success, an error-ish
  // object otherwise. Callers decide whether that is fatal — for the
  // contact form the notification to the behaviourist is, and the copy to
  // the visitor is not.
  function send(message) {
    return resend.emails
      .send({
        from: from,
        to: message.to,
        replyTo: message.replyTo,
        subject: message.subject,
        // Plain text only, never HTML: nothing a visitor types can then
        // inject markup or scripts into an email.
        text: message.text,
      })
      .then((result) => result.error || null, (err) => err);
  }

  // Fire-and-forget for mail whose failure must not change what the caller
  // returns to the user. Logging is the entire error path on purpose — the
  // alternative is failing a request that actually succeeded.
  function sendNonCritical(message, label) {
    return send(message).then((error) => {
      if (error) {
        console.error(`Failed to send ${label}:`, error.message || error);
      }
      return error;
    });
  }

  return { send, sendNonCritical };
}

module.exports = { createMailer, bilingual, bilingualSubject };
