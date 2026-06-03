/**
 * On-demand Granola sync — runs a single poll immediately instead of waiting on the 30s cron.
 *   npm run granola:sync   (from repo root or apps/api)
 *
 * Producer-only: it fetches notes (scoped to GRANOLA_FOLDER_IDS), inserts signals, and
 * enqueues them to signals.extract. Run the API (`npm run dev`) to have the worker drain the queue
 * into tasks — or run this while the app is already up.
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { Queue } from 'bullmq';
import { GranolaService, parseGranolaFolderIds } from './ingestion/granola/granola.service';
import { QUEUES, redisConnection } from './shared/queues.module';

// Minimal ConfigService surface — GranolaService + redisConnection only call `.get(key, default)`.
const config = { get: (k: string, def?: any) => process.env[k] ?? def } as any;

async function run() {
  if (!process.env.GRANOLA_API_KEY) {
    console.error('GRANOLA_API_KEY is not set — nothing to sync.');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/tctm',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });
  const db = drizzle(pool);
  const queue = new Queue(QUEUES.SIGNALS_EXTRACT, { connection: redisConnection(config) });

  const folders = parseGranolaFolderIds(process.env.GRANOLA_FOLDER_IDS);
  if (folders.length === 0) {
    console.error('GRANOLA_FOLDER_IDS is not set — no folder to track, nothing to sync.');
    process.exit(1);
  }
  console.log(`Running Granola sync (folders: ${folders.join(', ')})...`);

  const granola = new GranolaService(db as any, queue, config);
  await granola.poll();

  // Quick confirmation: how many Granola signals landed in the last few minutes.
  const res: any = await db.execute(
    sql`select count(*)::int as n from signals where source = 'granola' and created_at > now() - interval '5 minutes'`,
  );
  const n = res.rows?.[0]?.n ?? res?.[0]?.n ?? 0;
  console.log(`Sync complete — ${n} Granola signal(s) created in the last 5 min (queued for extraction).`);

  await queue.close();
  await pool.end();
}

run().catch((err) => {
  console.error('Granola sync failed:', err);
  process.exit(1);
});
