import { config, emailConfigured } from './config.js';

/** @param {string} value */
function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c);
}

/**
 * @param {{ heading: string, intro: string, actionLabel: string, url: string, note: string }} p
 */
function layout({ heading, intro, actionLabel, url, note }) {
  return `<!doctype html><html><body style="margin:0;background:#f1f1ef;font-family:Georgia,'Times New Roman',serif;color:#111">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid rgba(0,0,0,.12)">
<tr><td style="padding:28px 32px 12px;border-bottom:1px solid rgba(0,0,0,.12)">
<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#555">Pearls360 Employee Portal</p>
<h1 style="margin:10px 0 0;font-size:26px;font-weight:400">${escapeHtml(heading)}</h1></td></tr>
<tr><td style="padding:28px 32px;font-size:16px;line-height:1.6">
<p style="margin:0 0 24px">${escapeHtml(intro)}</p>
<p style="margin:0 0 24px"><a href="${escapeHtml(url)}" style="display:inline-block;background:#000;color:#fff;text-decoration:none;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:14px;letter-spacing:.04em">${escapeHtml(actionLabel)}</a></p>
<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#666">${escapeHtml(note)}</p>
</td></tr></table></td></tr></table></body></html>`;
}

/**
 * Sends the activation / reset link. Returns false when email isn't configured
 * (the caller then hands the link to the admin instead).
 * @param {{ to: string, purpose: 'activation' | 'reset', url: string }} p
 */
export async function sendAccessLinkEmail({ to, purpose, url }) {
  if (!emailConfigured()) return false;
  const activation = purpose === 'activation';
  const html = layout({
    heading: activation ? 'Set up your account' : 'Reset your password',
    intro: activation
      ? 'An account has been created for you on the Pearls360 Employee Portal. Use the button below to choose your password.'
      : 'A password reset was requested for your Pearls360 Employee Portal account.',
    actionLabel: activation ? 'Set your password' : 'Choose a new password',
    url,
    note: activation
      ? 'This link can be used once and expires in 72 hours.'
      : 'This link can be used once and expires in 30 minutes. If you did not request this, you can ignore this email.'
  });

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.email.resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: config.email.from,
      to: [to],
      subject: activation ? 'Set up your Pearls360 Employee Portal account' : 'Reset your Pearls360 portal password',
      html
    })
  });
  if (!response.ok) {
    console.error('[email] send failed', response.status);
    return false;
  }
  return true;
}
