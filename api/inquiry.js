const email = require('./lib/email');

async function handler(req, res) {
  if (req.method !== 'POST') {
    email.json(res, 405, { ok: false, error: 'Method not allowed.' });
    return;
  }

  try {
    var body = await email.readJson(req);
    var fields = email.sanitizeFields(body.fields);
    var name = email.first(fields, 'Full name');
    var customerEmail = email.first(fields, 'Email');
    var phone = email.first(fields, ['Phone number', 'Phone']);

    if (!name || name.length < 2) {
      email.json(res, 400, { ok: false, error: 'Please enter your full name.' });
      return;
    }
    if (!email.isEmail(customerEmail)) {
      email.json(res, 400, { ok: false, error: 'Please enter a valid email address.' });
      return;
    }
    if (!phone) {
      email.json(res, 400, { ok: false, error: 'Please enter a phone number.' });
      return;
    }

    var files = email.sanitizeFiles(body.files, {
      maxEach: 1024 * 1024,
      maxTotal: 2 * 1024 * 1024,
      allowed: ['image/jpeg', 'image/png', 'image/gif', 'image/jpg'],
      allowedExt: ['jpg', 'jpeg', 'png', 'gif']
    });

    var occasion = email.first(fields, 'Occasion');
    var studioHtml = email.wrapEmail(
      'New inquiry from ' + name,
      'New inquiry',
      '<p style="margin:0 0 18px;">A discovery questionnaire has been submitted through the website.</p>' +
      (occasion ? '<p style="margin:0 0 22px;">Occasion: <strong>' + email.escapeHtml(occasion) + '</strong></p>' : '') +
      email.fieldsTable(fields) +
      (files.length ? '<p style="margin:22px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#555;">' + files.length + ' inspiration file' + (files.length === 1 ? '' : 's') + ' attached.</p>' : '')
    );

    var confirmHtml = email.wrapEmail(
      'We received your inquiry',
      'Thank you, ' + name,
      '<p style="margin:0 0 16px;">We have received your Discovery Questionnaire and will review it with care ahead of your conversation with our studio.</p>' +
      '<p style="margin:0 0 16px;">Our team will be in touch regarding next steps. If your plans change in the meantime, you may reply to this email.</p>' +
      '<p style="margin:0;">With appreciation,<br>Pearls360 Design &amp; Planning</p>'
    );

    var studioPayload = {
      from: email.FROM,
      to: [email.STUDIO],
      reply_to: customerEmail,
      subject: 'New Pearls360 Inquiry — ' + name,
      html: studioHtml
    };
    if (files.length) {
      studioPayload.attachments = files.map(function (file) {
        return { filename: file.filename, content: file.content };
      });
    }

    await email.sendResend(studioPayload);
    await email.sendResend({
      from: email.FROM,
      to: [customerEmail],
      reply_to: email.STUDIO,
      subject: 'We received your inquiry — Pearls360 Design & Planning',
      html: confirmHtml
    });

    email.json(res, 200, { ok: true });
  } catch (err) {
    email.json(res, err.status || 500, {
      ok: false,
      error: err.message || 'Unable to send your inquiry. Please try again.'
    });
  }
}

handler.config = {
  api: {
    bodyParser: {
      sizeLimit: '6mb'
    }
  }
};

module.exports = handler;
