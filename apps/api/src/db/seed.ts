import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { and, eq } from 'drizzle-orm';
import { sourceConfig, promptVersions } from './schema';
import { EXTRACTION_SYSTEM_PROMPT, JUDGE_SYSTEM_PROMPT } from '../extraction/prompts';
import { planPromptSeed } from './prompt-seed-plan';

// Connector-level rows: the `enabled` flag pauses/resumes a whole source (gated in the extraction
// processor by signal.source). Thresholds are unused here (routing uses the per-sub-source rows).
// Granola's connector row IS its sub-source row ('granola'), defined below.
const CONNECTOR_DEFAULT = {
  enabled: true,
  thresholds: {
    autoCreate: { explicitness: 0, actionability: 0, addressedToUser: 0, overallConfidence: 0 },
    skipBelow: { explicitness: 0, actionability: 0 },
  },
  filters: {},
};

const DEFAULT_CONFIGS = [
  { source: 'slack', ...CONNECTOR_DEFAULT },
  { source: 'gmail', ...CONNECTOR_DEFAULT },
  { source: 'notion', ...CONNECTOR_DEFAULT },
  {
    source: 'granola',
    enabled: true,
    thresholds: {
      autoCreate: { explicitness: 0.6, actionability: 0.7, addressedToUser: 0.7, overallConfidence: 0.65 },
      skipBelow: { explicitness: 0.3, actionability: 0.4 },
    },
    filters: {},
  },
  {
    source: 'slack_dm',
    enabled: true,
    thresholds: {
      autoCreate: { explicitness: 0.75, actionability: 0.75, addressedToUser: 0.85, overallConfidence: 0.75 },
      skipBelow: { explicitness: 0.4, actionability: 0.4 },
    },
    filters: {},
  },
  {
    // Directly @mentions or names the partner — strong "for you" signal; lenient, judge still runs.
    source: 'slack_mention',
    enabled: true,
    thresholds: {
      autoCreate: { explicitness: 0.7, actionability: 0.7, addressedToUser: 0.7, overallConfidence: 0.65 },
      skipBelow: { explicitness: 0.3, actionability: 0.3 },
    },
    filters: {},
  },
  {
    // Anchored only by the partner being in the thread (no tag/name) — weak signal; conservative.
    source: 'slack_channel',
    enabled: true,
    thresholds: {
      autoCreate: { explicitness: 0.9, actionability: 0.85, addressedToUser: 0.9, overallConfidence: 0.85 },
      skipBelow: { explicitness: 0.5, actionability: 0.5 },
    },
    filters: {},
  },
  {
    // @tctm mention — explicit partner capture; thresholds are zero (judge bypassed downstream).
    source: 'slack_capture',
    enabled: true,
    thresholds: {
      autoCreate: { explicitness: 0, actionability: 0, addressedToUser: 0, overallConfidence: 0 },
      skipBelow: { explicitness: 0, actionability: 0 },
    },
    filters: {},
  },
  {
    // 🎯 reaction — explicit partner capture; thresholds are zero (judge bypassed downstream).
    source: 'slack_reaction',
    enabled: true,
    thresholds: {
      autoCreate: { explicitness: 0, actionability: 0, addressedToUser: 0, overallConfidence: 0 },
      skipBelow: { explicitness: 0, actionability: 0 },
    },
    filters: {},
  },
  {
    source: 'gmail_vip',
    enabled: true,
    thresholds: {
      autoCreate: { explicitness: 0.75, actionability: 0.75, addressedToUser: 0.85, overallConfidence: 0.75 },
      skipBelow: { explicitness: 0.4, actionability: 0.4 },
    },
    filters: {},
  },
  {
    source: 'gmail_cold',
    enabled: true,
    thresholds: {
      autoCreate: { explicitness: 0.9, actionability: 0.9, addressedToUser: 0.9, overallConfidence: 0.88 },
      skipBelow: { explicitness: 0.5, actionability: 0.5 },
    },
    filters: {},
  },
  {
    // Gmail forward WITH a note — deliberate drop into the task inbox; lenient (judge still runs).
    source: 'gmail_forward',
    enabled: true,
    thresholds: {
      autoCreate: { explicitness: 0.6, actionability: 0.65, addressedToUser: 0.6, overallConfidence: 0.6 },
      skipBelow: { explicitness: 0.2, actionability: 0.2 },
    },
    filters: {},
  },
  {
    // Gmail direct email to the tctm@ dropbox (not a forward) — a deliberate drop; lenient, judge runs.
    source: 'gmail_dropbox',
    enabled: true,
    thresholds: {
      autoCreate: { explicitness: 0.6, actionability: 0.65, addressedToUser: 0.5, overallConfidence: 0.6 },
      skipBelow: { explicitness: 0.2, actionability: 0.2 },
    },
    filters: {},
  },
  {
    // Gmail from a priority sender (GMAIL_PRIORITY_SENDERS + firm domain) — aggressive capture;
    // thresholds zero (judge bypassed downstream).
    source: 'gmail_priority',
    enabled: true,
    thresholds: {
      autoCreate: { explicitness: 0, actionability: 0, addressedToUser: 0, overallConfidence: 0 },
      skipBelow: { explicitness: 0, actionability: 0 },
    },
    filters: {},
  },
  {
    // Gmail bare forward (no note) — explicit partner capture; thresholds zero (judge bypassed).
    source: 'gmail_capture',
    enabled: true,
    thresholds: {
      autoCreate: { explicitness: 0, actionability: 0, addressedToUser: 0, overallConfidence: 0 },
      skipBelow: { explicitness: 0, actionability: 0 },
    },
    filters: {},
  },
  {
    source: 'notion_mention',
    enabled: true,
    thresholds: {
      autoCreate: { explicitness: 0.75, actionability: 0.75, addressedToUser: 0.85, overallConfidence: 0.75 },
      skipBelow: { explicitness: 0.4, actionability: 0.4 },
    },
    filters: {},
  },
  {
    source: 'notion_assigned',
    enabled: true,
    thresholds: {
      autoCreate: { explicitness: 0.5, actionability: 0.6, addressedToUser: 0.9, overallConfidence: 0.6 },
      skipBelow: { explicitness: 0.3, actionability: 0.3 },
    },
    filters: {},
  },
];

async function run() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/assistant',
  });

  const db = drizzle(pool);

  console.log('Seeding source_config...');
  for (const config of DEFAULT_CONFIGS) {
    await db
      .insert(sourceConfig)
      .values(config)
      .onConflictDoNothing({ target: sourceConfig.source });
  }
  console.log(`Seeded ${DEFAULT_CONFIGS.length} source configs.`);

  // Seed prompt versions (v1 — from hardcoded prompts)
  console.log('Seeding prompt_versions...');
  const promptSeeds = [
    { purpose: 'extract' as const, content: EXTRACTION_SYSTEM_PROMPT({ partnerName: '{{PARTNER_NAME}}', partnerRole: '{{PARTNER_ROLE}}', partnerAliases: '{{PARTNER_ALIASES}}', entityGlossaryXml: '{{ENTITY_GLOSSARY}}' }) },
    { purpose: 'judge' as const, content: JUDGE_SYSTEM_PROMPT },
  ];

  for (const seed of promptSeeds) {
    const versions = await db
      .select()
      .from(promptVersions)
      .where(eq(promptVersions.purpose, seed.purpose));

    const plan = planPromptSeed(versions, seed.content);

    if (plan.action === 'skip') {
      if (plan.reason === 'tuned') {
        const active = versions.find((v) => v.active);
        console.log(`  ${seed.purpose}: active v${active?.version} is tuned — not overwriting`);
      }
      continue;
    }

    // Republish drops the previously-active flag first; insert (v1) has nothing to deactivate.
    if (plan.action === 'republish') {
      await db.update(promptVersions).set({ active: false }).where(eq(promptVersions.purpose, seed.purpose));
    }

    await db.insert(promptVersions).values({
      purpose: seed.purpose,
      version: plan.version,
      content: seed.content,
      active: true,
      metadata: {
        createdBy: 'seed',
        reason: plan.action === 'insert' ? 'Initial V1 prompt' : 'Republished from code template',
      },
    });
    console.log(`  ${seed.purpose}: ${plan.action === 'insert' ? 'seeded v1' : `republished as v${plan.version}`}`);
  }
  console.log('Seeded prompt versions.');

  await pool.end();
}

run().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
