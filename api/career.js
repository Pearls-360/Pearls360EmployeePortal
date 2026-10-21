const email = require('./lib/email');

var ALLOWED_ROLES = [
  'Floral & Design Stylist',
  'Senior Event Planner',
  'Production Coordinator'
];

async function handler(req, res) {
  if (req.method !== 'POST') {
    email.json(res, 405, { ok: false, error: 'Method not allowed.' });
    return;
  }

  try {
    var body = await email.readJson(req);
    var fields = email.sanitizeFields(body.fields);
    var name = email.first(fields, 'Full name');
    var applicantEmail = email.first(fields, 'Email');
    var phone = email.first(fields, ['Phone', 'Phone number']);
    var city = email.first(fields, 'City');
    var note = email.first(fields, ['Cover note', 'Why Pearls360?']);
    var role = email.first(fields, 'Role');

    if (!name || name.length < 2) {
      email.json(res, 400, { ok: false, error: 'Please enter your full name.' });
      return;
    }
    if (!email.isEmail(applicantEmail)) {
      email.json(res, 400, { ok: false, error: 'Please enter a valid email address.' });
      return;
    }
    if (!phone) {
      email.json(res, 400, { ok: false, error: 'Please enter a phone number.' });
      return;
    }
    if (!city) {
      email.json(res, 400, { ok: false, error: 'Please enter your city.' });
      return;
    }
    if (!note) {
      email.json(res, 400, { ok: false, error: 'Please tell us why you would like to join Pearls360.' });
      return;
    }
    if (!role || ALLOWED_ROLES.indexOf(role) === -1) {
      email.json(res, 400, { ok: false, error: 'Please apply from an open role on the Careers page.' });
      return;
    }

    var files = email.sanitizeFiles(body.files, {
      maxEach: 8 * 1024 * 1024,
      maxTotal: 8 * 1024 * 1024,
      allowed: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ],
      allowedExt: ['pdf', 'doc', 'docx']
    });

    var studioHtml = email.wrapEmail(
      'New career application from ' + name,
      'New career application',
      '<p style="margin:0 0 18px;"><strong>' + email.escapeHtml(name) + '</strong> has applied for <strong>' + email.escapeHtml(role) + '</strong>.</p>' +
      email.fieldsTable(fields) +
      (files.length ? '<p style="margin:22px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#555;">Resume attached.</p>' : '<p style="margin:22px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#555;">No resume was attached.</p>')
    );

    var confirmHtml = email.wrapEmail(
      'We received your application',
      'Thank you, ' + name,
      '<p style="margin:0 0 16px;">We have received your application for the <strong>' + email.escapeHtml(role) + '</strong> role at Pearls360 Design &amp; Planning.</p>' +
      '<p style="margin:0 0 16px;">Our studio reviews every submission with care. We typically reply within 24 hours. If you need to share additional materials, you may reply to this email.</p>' +
      '<p style="margin:0;">With appreciation,<br>Pearls360 Design &amp; Planning</p>'
    );

    var studioPayload = {
      from: email.FROM,
      to: [email.STUDIO],
      reply_to: applicantEmail,
      subject: 'New Career Application — ' + name + ' — ' + role,
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
      to: [applicantEmail],
      reply_to: email.STUDIO,
      subject: 'We received your application — Pearls360 Design & Planning',
      html: confirmHtml
    });

    email.json(res, 200, { ok: true });
  } catch (err) {
    email.json(res, err.status || 500, {
      ok: false,
      error: err.message || 'Unable to send your application. Please try again.'
    });
  }
}

handler.config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
};

module.exports = handler;
