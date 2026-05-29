import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { and, eq } from 'drizzle-orm';
import { sourceConfig, promptVersions } from './schema';
import { EXTRACTION_SYSTEM_PROMPT, JUDGE_SYSTEM_PROMPT } from '../extraction/prompts';
import { SNOOZE_PROMPT, RESOLVE_PROMPT } from '../extraction/prompt-seeds';

const DEFAULT_CONFIGS = [
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
    source: 'slack_channel',
    enabled: true,
    thresholds: {
      autoCreate: { explicitness: 0.9, actionability: 0.85, addressedToUser: 0.9, overallConfidence: 0.85 },
      skipBelow: { explicitness: 0.5, actionability: 0.5 },
    },
    filters: {},
  },
  {
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
    { purpose: 'extract' as const, content: EXTRACTION_SYSTEM_PROMPT({ partnerName: '{{PARTNER_NAME}}', partnerRole: '{{PARTNER_ROLE}}', entityGlossaryXml: '{{ENTITY_GLOSSARY}}' }) },
    { purpose: 'judge' as const, content: JUDGE_SYSTEM_PROMPT },
    { purpose: 'snooze' as const, content: SNOOZE_PROMPT },
    { purpose: 'resolve' as const, content: RESOLVE_PROMPT },
  ];

  for (const seed of promptSeeds) {
    // Only insert if no version exists for this purpose
    const existing = await db
      .select()
      .from(promptVersions)
      .where(eq(promptVersions.purpose, seed.purpose))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(promptVersions).values({
        purpose: seed.purpose,
        version: 1,
        content: seed.content,
        active: true,
        metadata: { createdBy: 'seed', reason: 'Initial V1 prompt' },
      });
    }
  }
  console.log('Seeded prompt versions.');

  await pool.end();
}

run().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
