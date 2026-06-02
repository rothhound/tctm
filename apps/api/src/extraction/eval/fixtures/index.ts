/**
 * Hand-labeled eval dataset for extraction quality testing.
 * Each entry has a signal payload, expected extraction results, and expected judge verdict.
 *
 * Run the eval with: npm run test:api -- --testPathPattern=eval-runner
 */

export interface EvalFixture {
  id: string;
  description: string;
  signal: {
    source: string;
    subSource: string;
    title: string;
    body: string;
    author?: { name?: string; email?: string };
    occurredAt: string;
  };
  expected: {
    shouldExtract: boolean;
    taskCount: number;
    titles?: string[];
    types?: string[];
    judgeVerdict?: 'KEEP' | 'REVIEW' | 'DISMISS';
    // Entity-ref mentions that must NOT appear on any extracted task. Used to assert the partner
    // (by name/alias) is rendered as "you", never as a third-party entity. Matched case-insensitively.
    forbiddenEntityMentions?: string[];
  };
}

export const evalFixtures: EvalFixture[] = [
  // ── SHOULD EXTRACT (positive cases) ──────────────────────
  {
    id: 'slack-capture-named-self',
    description: 'Partner addressed by alias — extract as YOUR task, never an entityRef for yourself',
    signal: {
      source: 'slack', subSource: 'slack_capture',
      title: '@tctm capture in #deals',
      body: 'Flagged message (capture the task this indicates):\nGianfranco Montoya: GF could you run a Salesforce report for CEOs and founders in NY and SF?',
      author: { name: 'Gianfranco Montoya', email: 'gms@example.com' },
      occurredAt: '2026-06-01T23:00:00Z',
    },
    expected: {
      shouldExtract: true,
      taskCount: 1,
      types: ['do'],
      titles: ['Run Salesforce report: CEOs and founders in NY and SF'],
      forbiddenEntityMentions: ['GF', 'Gianfranco', 'Gianfranco Montoya'],
      judgeVerdict: 'KEEP',
    },
  },
  {
    id: 'slack-dm-cap-table',
    description: 'Direct ask for cap table with deadline',
    signal: {
      source: 'slack', subSource: 'slack_dm',
      title: 'Slack DM from Roelof',
      body: 'Hey, can you send me the updated cap table for Acme by EOD Friday? We need it for the Monday review.',
      author: { name: 'Roelof Botha', email: 'roelof@sequoiacap.com' },
      occurredAt: '2026-05-19T10:00:00Z',
    },
    expected: { shouldExtract: true, taskCount: 1, types: ['do'], judgeVerdict: 'KEEP' },
  },
  {
    id: 'slack-dm-intro-request',
    description: 'Founder asking for intro',
    signal: {
      source: 'slack', subSource: 'slack_dm',
      title: 'Slack DM from Sarah Chen',
      body: 'Would you be open to introducing me to the infra team at Stripe? We\'re building something adjacent and I think there could be a partnership angle.',
      author: { name: 'Sarah Chen', email: 'sarah@acme.io' },
      occurredAt: '2026-05-19T11:00:00Z',
    },
    expected: { shouldExtract: true, taskCount: 1, types: ['intro'], judgeVerdict: 'KEEP' },
  },
  {
    id: 'gmail-deck-review',
    description: 'Email asking to review a deck',
    signal: {
      source: 'gmail', subSource: 'gmail_vip',
      title: 'Re: Series B deck v3',
      body: 'Hi Jane, attached is the updated deck with the financial projections you asked for. Could you take a look and let me know your thoughts by Wednesday?',
      author: { name: 'Alex Kim', email: 'alex@portfolio.co' },
      occurredAt: '2026-05-19T09:00:00Z',
    },
    expected: { shouldExtract: true, taskCount: 1, types: ['review'], judgeVerdict: 'KEEP' },
  },
  {
    id: 'slack-channel-decision',
    description: 'Request for sign-off in channel',
    signal: {
      source: 'slack', subSource: 'slack_channel',
      title: 'Slack #deals from Mike',
      body: '<@U0123456789> we need your sign-off on the Acme term sheet. The founders are expecting a response by tomorrow.',
      author: { name: 'Mike Ross' },
      occurredAt: '2026-05-19T14:00:00Z',
    },
    expected: { shouldExtract: true, taskCount: 1, types: ['decide'], judgeVerdict: 'KEEP' },
  },
  {
    id: 'gmail-waiting-on',
    description: 'Partner expecting deliverable from someone',
    signal: {
      source: 'gmail', subSource: 'gmail_vip',
      title: 'Re: Quarterly report',
      body: 'Thanks Jane, I\'ll have the quarterly financial report to you by end of this week.',
      author: { name: 'CFO', email: 'cfo@portfolio.co' },
      occurredAt: '2026-05-19T08:00:00Z',
    },
    expected: { shouldExtract: true, taskCount: 1, types: ['waiting_on'], judgeVerdict: 'KEEP' },
  },
  {
    id: 'slack-reaction-task',
    description: 'Partner reaction creates task',
    signal: {
      source: 'slack', subSource: 'slack_reaction',
      title: 'Reaction in #general on message from Tom',
      body: 'Hey team, we should schedule a sync on the new fund structure. Can someone pull together a draft timeline?',
      author: { name: 'Tom Wilson' },
      occurredAt: '2026-05-19T15:00:00Z',
    },
    expected: { shouldExtract: true, taskCount: 1, judgeVerdict: 'KEEP' },
  },

  // ── SHOULD NOT EXTRACT (negative cases) ──────────────────
  {
    id: 'gmail-newsletter',
    description: 'Newsletter — no action',
    signal: {
      source: 'gmail', subSource: 'gmail_cold',
      title: 'Weekly AI Digest',
      body: 'This week in AI: New model releases, funding rounds, and industry trends. Read more at...',
      author: { name: 'AI Newsletter', email: 'newsletter@aiweekly.com' },
      occurredAt: '2026-05-19T06:00:00Z',
    },
    expected: { shouldExtract: false, taskCount: 0, judgeVerdict: 'DISMISS' },
  },
  {
    id: 'slack-social-pleasantry',
    description: 'Social message, not a task',
    signal: {
      source: 'slack', subSource: 'slack_dm',
      title: 'Slack DM from colleague',
      body: 'Hope you had a great weekend! The weather was amazing.',
      author: { name: 'Colleague' },
      occurredAt: '2026-05-19T09:30:00Z',
    },
    expected: { shouldExtract: false, taskCount: 0, judgeVerdict: 'DISMISS' },
  },
  {
    id: 'gmail-someone-elses-task',
    description: 'Task for someone else, not the partner',
    signal: {
      source: 'gmail', subSource: 'gmail_vip',
      title: 'Re: Legal review',
      body: 'Hi team, can Mark please send the NDA draft to outside counsel by Thursday? Jane, just keeping you in the loop.',
      author: { name: 'Legal Team', email: 'legal@firm.com' },
      occurredAt: '2026-05-19T10:30:00Z',
    },
    expected: { shouldExtract: false, taskCount: 0, judgeVerdict: 'DISMISS' },
  },
  {
    id: 'slack-past-tense-completed',
    description: 'Already completed action',
    signal: {
      source: 'slack', subSource: 'slack_channel',
      title: 'Slack #ops from Admin',
      body: 'FYI — I already sent the cap table to Sequoia and CC\'d you. All done on our end.',
      author: { name: 'Admin' },
      occurredAt: '2026-05-19T16:00:00Z',
    },
    expected: { shouldExtract: false, taskCount: 0, judgeVerdict: 'DISMISS' },
  },
  {
    id: 'gmail-vague-intent',
    description: 'Vague strategic musing, not actionable',
    signal: {
      source: 'gmail', subSource: 'gmail_vip',
      title: 'Thoughts on AI strategy',
      body: 'Jane, I\'ve been thinking we should probably revisit our AI thesis at some point. No rush, just wanted to plant the seed.',
      author: { name: 'Partner', email: 'partner@firm.com' },
      occurredAt: '2026-05-19T07:00:00Z',
    },
    expected: { shouldExtract: false, taskCount: 0, judgeVerdict: 'DISMISS' },
  },
  {
    id: 'slack-calendar-invite',
    description: 'Calendar notification, no action',
    signal: {
      source: 'slack', subSource: 'slack_channel',
      title: 'Slack #general from Calendar Bot',
      body: 'Reminder: Team standup in 15 minutes. Join at meet.google.com/xyz',
      author: { name: 'Calendar Bot' },
      occurredAt: '2026-05-19T09:45:00Z',
    },
    expected: { shouldExtract: false, taskCount: 0, judgeVerdict: 'DISMISS' },
  },
];
