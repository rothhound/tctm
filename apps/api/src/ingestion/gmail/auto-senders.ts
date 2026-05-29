/**
 * Domains and patterns for auto-sender emails that should be skipped.
 * These are newsletters, notifications, and automated senders that never contain tasks.
 */
export const AUTO_SENDER_PATTERNS: RegExp[] = [
  // Explicit noreply/no-reply
  /^no[-_]?reply@/i,
  /^noreply@/i,
  /^do[-_]?not[-_]?reply@/i,

  // Common notification senders
  /^notifications?@/i,
  /^alerts?@/i,
  /^updates?@/i,
  /^mailer[-_]?daemon@/i,
  /^postmaster@/i,
  /^bounce[s]?@/i,
  /^feedback@/i,
  /^support@.*\.zendesk\.com$/i,

  // Calendar
  /calendar-notification@google\.com$/i,
  /^calendar-server@/i,

  // Newsletter / marketing platforms
  /@.*\.mailchimp\.com$/i,
  /@.*\.sendgrid\.net$/i,
  /@.*\.hubspot\.com$/i,
  /@.*\.constantcontact\.com$/i,
  /@.*\.substack\.com$/i,
  /@.*\.beehiiv\.com$/i,
  /@.*\.convertkit\.com$/i,
  /@.*\.mailgun\.org$/i,

  // SaaS notifications
  /@.*\.notion\.so$/i,
  /@.*\.slack\.com$/i,
  /@.*\.atlassian\.net$/i,
  /@.*\.jira\.com$/i,
  /@.*\.github\.com$/i,
  /@.*\.gitlab\.com$/i,
  /@.*\.linear\.app$/i,
  /@.*\.figma\.com$/i,
  /@.*\.asana\.com$/i,
  /@.*\.monday\.com$/i,
  /@.*\.airtable\.com$/i,
  /@.*\.docusign\.net$/i,

  // Social
  /@.*\.linkedin\.com$/i,
  /@.*\.twitter\.com$/i,
  /@.*\.facebook\.com$/i,
  /@.*\.instagram\.com$/i,

  // Common newsletter domains
  /^newsletter@/i,
  /^digest@/i,
  /^weekly@/i,
  /^daily@/i,
  /^news@/i,
  /^info@/i,
  /^hello@.*\.substack\.com$/i,
];

export function isAutoSender(email: string): boolean {
  return AUTO_SENDER_PATTERNS.some((pattern) => pattern.test(email));
}
