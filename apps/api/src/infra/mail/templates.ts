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

export type InterviewEmail = {
  to: string;
  firstName: string;
  /** Candidates see the role only; interviewers also get the candidate name and an app link. */
  audience: 'candidate' | 'interviewer';
  kind: 'scheduled' | 'rescheduled' | 'cancelled';
  jobTitle: string;
  candidateName: string;
  when: string;
  mode: string;
  location?: string | null;
  meetingUrl?: string | null;
  reason?: string;
  link?: string;
  ics: string;
};

export function interviewEmail(e: InterviewEmail): MailMessage {
  const subject =
    e.kind === 'cancelled'
      ? `Cancelled: interview for ${e.jobTitle}`
      : e.kind === 'rescheduled'
        ? `Updated: interview for ${e.jobTitle}`
        : `Interview: ${e.jobTitle}`;
  const intro =
    e.audience === 'candidate'
      ? e.kind === 'cancelled'
        ? `Your interview for ${e.jobTitle} has been cancelled. Our recruiter will be in touch.`
        : `Your interview for ${e.jobTitle} is ${e.kind === 'rescheduled' ? 'now ' : ''}booked.`
      : e.kind === 'cancelled'
        ? `The interview with ${e.candidateName} for ${e.jobTitle} has been cancelled.`
        : `You are interviewing ${e.candidateName} for ${e.jobTitle}.`;
  const lines = [
    `Hi ${e.firstName},`,
    intro,
    `When: ${e.when}`,
    `Format: ${e.mode}`,
    ...(e.location ? [`Where: ${e.location}`] : []),
    ...(e.meetingUrl && e.kind !== 'cancelled' ? [`Link: ${e.meetingUrl}`] : []),
    ...(e.reason && e.audience === 'interviewer' ? [`Reason: ${e.reason}`] : []),
    'The calendar invite is attached.',
  ];
  const action =
    e.link && e.audience === 'interviewer' && e.kind !== 'cancelled'
      ? { label: 'Open in StaffOS', url: e.link }
      : undefined;
  return {
    to: e.to,
    subject,
    text: `${lines.join('\n\n')}${action ? `\n\n${action.url}` : ''}`,
    html: layout(subject, lines, action),
    icalEvent: { method: e.kind === 'cancelled' ? 'CANCEL' : 'REQUEST', content: e.ics },
  };
}
