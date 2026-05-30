import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { tasks, entities, signals, extractionFeedback } from './schema';

// ── Realistic data pools ───────────────────────────────────────────

const PEOPLE = [
  { name: 'Roelof Botha', role: 'Partner at Sequoia', email: 'roelof@sequoiacap.com' },
  { name: 'Sarah Chen', role: 'Founder at Acme AI', email: 'sarah@acme.ai' },
  { name: 'Michael Ross', role: 'Associate', email: 'michael@firm.com' },
  { name: 'Alfred Lin', role: 'Partner at Sequoia', email: 'alfred@sequoiacap.com' },
  { name: 'Priya Sharma', role: 'CEO at DataFlow', email: 'priya@dataflow.io' },
  { name: 'James Wong', role: 'CFO at Portfolio Co', email: 'james@portfolio.co' },
  { name: 'Lisa Park', role: 'Founder at NeuralEdge', email: 'lisa@neuraledge.com' },
  { name: 'David Kim', role: 'LP at Horizon Fund', email: 'david@horizonfund.com' },
  { name: 'Emma Torres', role: 'COO at Acme AI', email: 'emma@acme.ai' },
  { name: 'Alex Rivera', role: 'Founder at CloudBase', email: 'alex@cloudbase.dev' },
  { name: 'Rachel Green', role: 'Legal Counsel', email: 'rachel@lawfirm.com' },
  { name: 'Tom Wilson', role: 'Operating Partner', email: 'tom@firm.com' },
  { name: 'Nina Patel', role: 'Head of IR', email: 'nina@firm.com' },
  { name: 'Carlos Ruiz', role: 'Founder at Synthex', email: 'carlos@synthex.io' },
  { name: 'Mia Zhang', role: 'Board Observer', email: 'mia@horizonfund.com' },
];

const COMPANIES = [
  'Acme AI', 'DataFlow', 'NeuralEdge', 'CloudBase', 'Synthex',
  'Sequoia Capital', 'Horizon Fund', 'Greylock', 'a16z', 'Founders Fund',
  'TechCorp', 'InfraLabs', 'MediSync', 'QuantumLeap', 'Aether Systems',
];

const TASK_TEMPLATES = {
  do: [
    'Send updated cap table to {person}',
    'Prepare board deck for {company} Q{q} meeting',
    'Draft term sheet for {company} Series {series}',
    'Review and sign {company} side letter',
    'Schedule LP advisory committee meeting',
    'Update portfolio model with {company} latest metrics',
    'Send wire instructions for {company} investment',
    'Complete KYC documentation for {person}',
    'Prepare quarterly investor letter',
    'File Form D for {company} round',
    'Update CRM with {company} latest valuation',
    'Send {company} monthly report to LPs',
    'Book travel for {company} board meeting',
    'Process {company} capital call',
    'Review {company} hiring plan',
    'Send {person} the fund performance summary',
    'Compile due diligence notes on {company}',
    'Draft follow-on investment memo for {company}',
    'Update portfolio company tracker',
    'Prepare {company} co-investor update',
  ],
  reply: [
    'Reply to {person} about {company} timeline',
    'Respond to {person} re: term sheet feedback',
    'Answer {person} question about fund structure',
    'Reply to {company} founder about bridge financing',
    'Respond to LP inquiry from {person}',
    'Answer {person} about reference check',
    'Reply to {person} about board seat',
    'Respond to {company} CFO about audit',
  ],
  review: [
    'Review {company} v{v} pitch deck',
    'Review {company} financial model',
    'Review draft partnership agreement',
    'Review {company} data room documents',
    'Review {person} investment memo',
    'Review {company} customer pipeline',
    'Review LP quarterly report draft',
    'Review {company} product roadmap',
    'Review legal docs for {company} closing',
    'Review {company} org chart and hiring plan',
  ],
  decide: [
    'Decide on {company} Series {series} allocation',
    'Decide on {company} board seat representation',
    'Approve {company} bridge note terms',
    'Decide follow-on strategy for {company}',
    'Approve {company} employee option pool increase',
    'Decide on LP co-invest allocation for {company}',
  ],
  intro: [
    'Intro {person} to {company} CTO',
    'Connect {person} with {person2} for partnership',
    'Introduce {company} to potential customer',
    'Make warm intro for {person} to LP network',
    'Connect {company} with executive recruiter',
    'Intro {person} to legal counsel',
  ],
  waiting_on: [
    'Waiting on {person} for {company} financials',
    'Waiting on {company} data room access',
    'Waiting on {person} for reference feedback',
    'Waiting on legal review from {person}',
    'Waiting on {company} to send signed docs',
    'Waiting on {person} for co-invest commitment',
    'Waiting on {company} updated cap table',
    'Waiting on LP wire from {person}',
  ],
};

const SUBTASK_TEMPLATES = [
  'Gather supporting data',
  'Draft initial version',
  'Get internal review',
  'Send for legal review',
  'Incorporate feedback',
  'Final review and sign-off',
  'Schedule follow-up call',
  'Update tracking spreadsheet',
  'Prepare executive summary',
  'Coordinate with operations team',
];

const SOURCES: Array<'slack' | 'gmail' | 'notion' | 'granola'> = ['slack', 'gmail', 'notion', 'granola'];
const SUB_SOURCES: Record<string, string[]> = {
  slack: ['slack_dm', 'slack_channel', 'slack_reaction'],
  gmail: ['gmail_vip', 'gmail_cold'],
  notion: ['notion_mention', 'notion_assigned'],
  granola: ['granola'],
};

const AMBIGUITY_FLAGS = ['no_deadline', 'unclear_assignee', 'vague_action', 'unresolved_entity', 'past_tense'];

// ── Helpers ────────────────────────────────────────────────────────

function pick<T>(arr: readonly T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function pickN<T>(arr: readonly T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}
function rand(min: number, max: number): number { return Math.random() * (max - min) + min; }
function randInt(min: number, max: number): number { return Math.floor(rand(min, max)); }

function fillTemplate(template: string): string {
  return template
    .replace('{person}', pick(PEOPLE).name)
    .replace('{person2}', pick(PEOPLE).name)
    .replace('{company}', pick(COMPANIES))
    .replace('{series}', pick(['A', 'B', 'C', 'D']))
    .replace('{q}', String(randInt(1, 5)))
    .replace('{v}', String(randInt(2, 8)));
}

function randomDate(daysBack: number, daysForward: number): Date {
  const now = Date.now();
  const offset = (Math.random() * (daysBack + daysForward) - daysBack) * 86400000;
  return new Date(now + offset);
}

function makeExtraction() {
  const exp = rand(0.3, 1);
  const act = rand(0.3, 1);
  const addr = rand(0.3, 1);
  const ent = rand(0.3, 1);
  const temp = rand(0.1, 1);
  const overall = (exp + act + addr + ent + temp) / 5;
  const flags = Math.random() > 0.7 ? pickN(AMBIGUITY_FLAGS, randInt(1, 3)) : [];

  return {
    sourceQuote: 'Could you take care of this when you get a chance?',
    confidence: Number(overall.toFixed(2)),
    signals: {
      explicitness: Number(exp.toFixed(2)),
      actionability: Number(act.toFixed(2)),
      addressedToUser: Number(addr.toFixed(2)),
      entityMatchConfidence: Number(ent.toFixed(2)),
      temporalClarity: Number(temp.toFixed(2)),
    },
    ambiguityFlags: flags,
    judge: {
      verdict: pick(['KEEP', 'KEEP', 'KEEP', 'REVIEW', 'DISMISS']) as 'KEEP' | 'REVIEW' | 'DISMISS',
      reason: pick([
        'Clear actionable task directed at partner',
        'Explicit request with deadline',
        'High confidence extraction',
        'Ambiguous timing but actionable',
        'Plausible but needs review',
      ]),
    },
    extractorModel: 'claude-opus-4-7',
    judgeModel: 'claude-haiku-4-5',
    extractedAt: randomDate(30, 0).toISOString(),
  };
}

// ── Main ───────────────────────────────────────────────────────────

async function run() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/tctm',
  });
  const db = drizzle(pool);

  // Clean previous seed data
  console.log('Cleaning previous data...');
  await db.delete(extractionFeedback);
  await db.delete(tasks);
  await db.delete(signals);
  await db.delete(entities);
  console.log('Cleaned.');

  console.log('Seeding entities...');

  // Seed entities
  const entityIds: string[] = [];
  for (const person of PEOPLE) {
    const [row] = await db
      .insert(entities)
      .values({
        type: 'person',
        canonicalName: person.name,
        aliases: [person.name.split(' ')[0]],
        context: person.role,
        emails: [person.email],
        slackIds: [],
        lastInteractionAt: randomDate(30, 0),
      })
      .onConflictDoNothing()
      .returning({ id: entities.id });
    if (row) entityIds.push(row.id);
  }

  for (const company of COMPANIES) {
    const [row] = await db
      .insert(entities)
      .values({
        type: 'company',
        canonicalName: company,
        aliases: [],
        context: `Portfolio company / partner firm`,
        emails: [],
        slackIds: [],
      })
      .onConflictDoNothing()
      .returning({ id: entities.id });
    if (row) entityIds.push(row.id);
  }
  console.log(`Seeded ${entityIds.length} entities.`);

  // Seed signals (80 — tasks reference these)
  console.log('Seeding signals...');
  const signalIds: string[] = [];
  for (let i = 0; i < 80; i++) {
    const source = pick(SOURCES);
    const subSource = pick(SUB_SOURCES[source]);
    const person = pick(PEOPLE);
    const [row] = await db
      .insert(signals)
      .values({
        source,
        subSource,
        externalId: `seed-${source}-${i}-${Date.now()}`,
        dedupKey: `${source}:seed-${i}-${Date.now()}`,
        status: pick(['extracted', 'no_task', 'extracted', 'extracted']),
        payload: {
          title: `${source} signal from ${person.name}`,
          body: `This is a seeded signal for testing. ${pick(COMPANIES)} related.`,
          author: { name: person.name, email: person.email },
          occurredAt: randomDate(30, 0).toISOString(),
          raw: {},
        },
        processedAt: randomDate(30, 0),
      })
      .returning({ id: signals.id });
    if (row) signalIds.push(row.id);
  }
  console.log(`Seeded ${signalIds.length} signals.`);

  // Seed tasks
  console.log('Seeding 80 tasks...');
  const buckets = ['inbox', 'review'] as const;
  const priorities = ['high', 'mid', 'low'] as const;
  const taskTypes = Object.keys(TASK_TEMPLATES) as Array<keyof typeof TASK_TEMPLATES>;
  const parentTaskIds: string[] = [];
  let taskCount = 0;

  // Distribution: 80 total → 30 pending, 15 done, 20 archived, 15 reported
  const distribution = [
    ...Array(30).fill('pending'),
    ...Array(15).fill('done'),
    ...Array(20).fill('archived'),
    ...Array(15).fill('reported'),
  ];
  // Shuffle
  for (let i = distribution.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [distribution[i], distribution[j]] = [distribution[j], distribution[i]];
  }

  for (let i = 0; i < distribution.length; i++) {
    const kind = distribution[i];
    const isDone = kind === 'done';
    const isArchived = kind === 'archived';
    const isReported = kind === 'reported';
    const type = pick(taskTypes);
    const template = pick(TASK_TEMPLATES[type]);
    const title = fillTemplate(template);
    const bucket = pick([...buckets]);
    const priority = pick([...priorities]);
    const hasRecurrence = Math.random() < 0.08;
    const hasDueDate = Math.random() < 0.6;
    const hasReminder = kind === 'pending' && Math.random() < 0.1;
    const isAutoCreated = Math.random() < 0.5;

    const dueAt = hasDueDate ? randomDate(-5, 14) : null;

    const [row] = await db
      .insert(tasks)
      .values({
        title,
        description: Math.random() > 0.3 ? `<p>${pick(COMPANIES)} — ${pick(PEOPLE).role}. ${Math.random() > 0.5 ? '<strong>Urgent</strong> — ' : ''}needs attention by ${pick(['end of week', 'tomorrow', 'next Monday', 'board meeting', 'closing date'])}.</p>` : null,
        status: isDone ? 'done' : 'pending',
        bucket,
        priority,
        source: pick(['slack', 'gmail', 'notion', 'granola']),
        dueAt,
        reminderAt: hasReminder ? randomDate(1, 7) : null,
        recurrence: hasRecurrence ? {
          pattern: pick(['daily', 'weekly', 'monthly']) as 'daily' | 'weekly' | 'monthly',
          interval: randInt(1, 3),
        } : null,
        entityIds: pickN(entityIds, randInt(0, 3)),
        sourceSignalIds: signalIds.length > 0 ? pickN(signalIds, randInt(0, 2)) : [],
        waitingOnEntityIds: type === 'waiting_on' ? pickN(entityIds, randInt(1, 2)) : [],
        extraction: isReported || Math.random() < 0.85 ? makeExtraction() : null,
        autoCreated: isAutoCreated,
        dedupHash: `seed-${i}-${Date.now().toString(36)}`,
        archived: isArchived,
        archivedAt: isArchived ? randomDate(14, 0) : null,
        reported: isReported,
        reportedAt: isReported ? randomDate(14, 0) : null,
        reportReason: isReported ? pick(['not_a_task', 'duplicate', 'wrong_priority', 'wrong_person', 'already_done', 'irrelevant']) : null,
        completedAt: isDone ? randomDate(7, 0) : null,
        createdAt: randomDate(30, -1),
        updatedAt: randomDate(7, 0),
      })
      .returning({ id: tasks.id });

    if (row) {
      taskCount++;
      if (Math.random() < 0.15 && kind === 'pending') {
        parentTaskIds.push(row.id);
      }
    }
  }
  console.log(`Seeded ${taskCount} tasks (30 pending, 15 done, 20 archived, 15 reported).`);

  // Seed subtasks for parent tasks
  console.log('Seeding subtasks...');
  let subtaskCount = 0;
  for (const parentId of parentTaskIds) {
    const numSubtasks = randInt(2, 6);
    const subtaskNames = pickN(SUBTASK_TEMPLATES, numSubtasks);

    for (let j = 0; j < subtaskNames.length; j++) {
      const subDone = Math.random() < 0.4;
      await db.insert(tasks).values({
        title: subtaskNames[j],
        status: subDone ? 'done' : 'pending',
        bucket: 'inbox',
        priority: pick([...priorities]),
        parentTaskId: parentId,
        completedAt: subDone ? randomDate(7, 0) : null,
        entityIds: [],
        sourceSignalIds: [],
        waitingOnEntityIds: [],
        createdAt: randomDate(20, 0),
        updatedAt: randomDate(10, 0),
      });
      subtaskCount++;
    }
  }
  console.log(`Seeded ${subtaskCount} subtasks across ${parentTaskIds.length} parent tasks.`);

  console.log('Done! Total seeded:');
  console.log(`  Entities: ${entityIds.length}`);
  console.log(`  Signals: ${signalIds.length}`);
  console.log(`  Tasks: ${taskCount}`);
  console.log(`  Subtasks: ${subtaskCount}`);

  await pool.end();
}

run().catch((err) => {
  console.error('Task seed failed:', err);
  process.exit(1);
});
