import type { MailMessage } from './mail.service';

// Plain templates: user-provided values are HTML-escaped; links are built server-side.

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function layout(
  title: string,
  paragraphs: string[],
  action?: { label: string; url: string },
): string {
  const body = paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('');
  const button = action
    ? `<p><a href="${escapeHtml(action.url)}" style="background:#4f46e5;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block">${escapeHtml(action.label)}</a></p>`
    : '';
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#0f172a;line-height:1.5"><h2>${escapeHtml(title)}</h2>${body}${button}<p style="color:#475569;font-size:12px">StaffOS</p></body></html>`;
}

export function invitationEmail(to: string, firstName: string, url: string): MailMessage {
  const lines = [
    `Hi ${firstName},`,
    'You have been invited to StaffOS. Set your password to activate your account.',
    'This link expires in 72 hours.',
  ];
  return {
    to,
    subject: 'Your StaffOS invitation',
    text: `${lines.join('\n\n')}\n\n${url}`,
    html: layout('Welcome to StaffOS', lines, { label: 'Set your password', url }),
  };
}

export function passwordResetEmail(to: string, firstName: string, url: string): MailMessage {
  const lines = [
    `Hi ${firstName},`,
    'We received a request to reset your StaffOS password. This link expires in 30 minutes.',
    'If you did not ask for this, you can ignore this email.',
  ];
  return {
    to,
    subject: 'Reset your StaffOS password',
    text: `${lines.join('\n\n')}\n\n${url}`,
    html: layout('Reset your password', lines, { label: 'Reset password', url }),
  };
}
