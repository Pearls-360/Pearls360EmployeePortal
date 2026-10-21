const FROM = 'Pearls360 Designs <forms@pearls360designs.com>';
const STUDIO = 'Info@pearls360design.com';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function asList(fields, key) {
  var value = fields && fields[key];
  if (Array.isArray(value)) return value.map(function (item) { return String(item).trim(); }).filter(Boolean);
  if (value == null) return [];
  var text = String(value).trim();
  return text ? [text] : [];
}

function first(fields, keys) {
  var names = Array.isArray(keys) ? keys : [keys];
  for (var i = 0; i < names.length; i++) {
    var list = asList(fields, names[i]);
    if (list.length) return list[0];
  }
  return '';
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function wrapEmail(preview, heading, bodyHtml) {
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' +
    escapeHtml(heading) +
    '</title></head><body style="margin:0;padding:0;background:#f1f1ef;color:#111;font-family:Georgia,\'Times New Roman\',serif;">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;">' + escapeHtml(preview) + '</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f1ef;padding:32px 16px;">' +
    '<tr><td align="center">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border:1px solid rgba(0,0,0,.12);">' +
    '<tr><td style="padding:28px 32px 12px;border-bottom:1px solid rgba(0,0,0,.12);">' +
    '<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#555;">Pearls360 Design &amp; Planning</p>' +
    '<h1 style="margin:10px 0 0;font-size:28px;line-height:1.25;font-weight:400;">' + escapeHtml(heading) + '</h1>' +
    '</td></tr>' +
    '<tr><td style="padding:28px 32px 36px;font-size:16px;line-height:1.6;">' + bodyHtml + '</td></tr>' +
    '<tr><td style="padding:16px 32px 24px;border-top:1px solid rgba(0,0,0,.12);font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:.04em;color:#666;">' +
    'Washington DC · Maryland · Destinations worldwide<br>Info@pearls360design.com' +
    '</td></tr></table></td></tr></table></body></html>';
}

function fieldsTable(fields) {
  var keys = Object.keys(fields || {});
  if (!keys.length) return '<p style="margin:0;">No additional details were provided.</p>';
  var rows = keys.map(function (key) {
    var value = asList(fields, key).join(', ');
    if (!value) return '';
    return '<tr>' +
      '<td style="padding:10px 0;border-bottom:1px solid rgba(0,0,0,.1);width:36%;vertical-align:top;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#666;">' +
      escapeHtml(key) + '</td>' +
      '<td style="padding:10px 0 10px 16px;border-bottom:1px solid rgba(0,0,0,.1);vertical-align:top;font-size:15px;line-height:1.5;">' +
      escapeHtml(value).replace(/\n/g, '<br>') + '</td></tr>';
  }).join('');
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + rows + '</table>';
}

function sanitizeFields(raw) {
  var fields = {};
  if (!raw || typeof raw !== 'object') return fields;
  Object.keys(raw).forEach(function (key) {
    var label = String(key).slice(0, 120);
    var values = Array.isArray(raw[key]) ? raw[key] : [raw[key]];
    var cleaned = values.map(function (item) {
      return String(item == null ? '' : item).trim().slice(0, 8000);
    }).filter(Boolean);
    if (cleaned.length) fields[label] = cleaned;
  });
  return fields;
}

function sanitizeFiles(raw, options) {
  var files = Array.isArray(raw) ? raw : [];
  var maxEach = (options && options.maxEach) || 1024 * 1024;
  var maxTotal = (options && options.maxTotal) || 2 * 1024 * 1024;
  var allowed = (options && options.allowed) || [];
  var out = [];
  var total = 0;
  files.forEach(function (file) {
    if (!file || !file.content || !file.filename) return;
    var filename = String(file.filename).replace(/[/\\]/g, '').slice(0, 180);
    var type = String(file.type || '').slice(0, 120);
    var content = String(file.content).replace(/\s/g, '');
    if (!/^[A-Za-z0-9+/=]+$/.test(content)) return;
    var size = Math.ceil(content.length * 0.75);
    if (size > maxEach || total + size > maxTotal) return;
    var ext = (filename.split('.').pop() || '').toLowerCase();
    var allowedExt = options && options.allowedExt;
    var typeOk = !allowed.length || allowed.indexOf(type) !== -1;
    var extOk = !allowedExt || allowedExt.indexOf(ext) !== -1;
    if (allowed.length || allowedExt) {
      if (!typeOk && !extOk) return;
    }
    if (!type) type = 'application/octet-stream';
    total += size;
    out.push({ filename: filename, content: content, type: type });
  });
  return out;
}

async function sendResend(payload) {
  var key = process.env.RESEND_API_KEY;
  if (!key) {
    var configError = new Error('Email service is not configured.');
    configError.status = 500;
    throw configError;
  }
  var response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  var data = {};
  try { data = await response.json(); } catch (err) { data = {}; }
  if (!response.ok) {
    var sendError = new Error(data.message || 'Unable to send email at this time.');
    sendError.status = 502;
    throw sendError;
  }
  return data;
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise(function (resolve, reject) {
    if (req.body && typeof req.body === 'object') {
      resolve(req.body);
      return;
    }
    var chunks = [];
    req.on('data', function (chunk) { chunks.push(chunk); });
    req.on('end', function () {
      var raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) {
        resolve({});
        return;
      }
      try { resolve(JSON.parse(raw)); }
      catch (err) { reject(new Error('Invalid request.')); }
    });
    req.on('error', reject);
  });
}

module.exports = {
  FROM: FROM,
  STUDIO: STUDIO,
  escapeHtml: escapeHtml,
  asList: asList,
  first: first,
  isEmail: isEmail,
  wrapEmail: wrapEmail,
  fieldsTable: fieldsTable,
  sanitizeFields: sanitizeFields,
  sanitizeFiles: sanitizeFiles,
  sendResend: sendResend,
  json: json,
  readJson: readJson
};
