import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { signals, tasks, taskNotes, extractionFeedback, llmAuditLog, entities } from './schema';

/**
 * Wipe transactional data so you can start testing real integrations from a clean slate.
 * ALWAYS PRESERVES operational config: source_config (thresholds) + prompt_versions (active prompts).
 *
 * By default the entity glossary is KEPT (you usually want a curated glossary across test runs).
 * Pass --entities to also clear it.
 *
 *   npm run db:clean                 # tasks, signals & history
 *   npm run db:clean -- --entities   # ...plus the entity glossary
 *
 * Refuses to run when NODE_ENV=production.
 */
async function run() {
  if (process.env.NODE_ENV === 'production') {
    console.error('✗ Refusing to clean data in production (NODE_ENV=production).');
    process.exit(1);
  }

  const alsoEntities = process.argv.includes('--entities');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/assistant',
  });
  const db = drizzle(pool);

  // FK-safe order. tasks cascades to task_notes + extraction_feedback, but llm_audit_log and
  // extraction_feedback have RESTRICT FKs to signals, so dependents are cleared before tasks/signals.
  const fb = await db.delete(extractionFeedback).returning({ id: extractionFeedback.id });
  const notes = await db.delete(taskNotes).returning({ id: taskNotes.id });
  const audit = await db.delete(llmAuditLog).returning({ id: llmAuditLog.id });
  const t = await db.delete(tasks).returning({ id: tasks.id });
  const s = await db.delete(signals).returning({ id: signals.id });
  const e = alsoEntities ? await db.delete(entities).returning({ id: entities.id }) : [];

  console.log('✓ DB cleaned (config + prompts preserved):');
  console.log(`    tasks                ${t.length}`);
  console.log(`    signals              ${s.length}`);
  console.log(`    extraction_feedback  ${fb.length}`);
  console.log(`    task_notes           ${notes.length}`);
  console.log(`    llm_audit_log        ${audit.length}`);
  console.log(`    entities             ${alsoEntities ? e.length : 'kept'}`);

  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
