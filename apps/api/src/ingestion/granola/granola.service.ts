import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { DB, DbType } from '../../db/db.module';
import { granolaPollState, signals } from '../../db/schema';
import { QUEUES } from '../../shared/queues.module';

type SignalInsert = typeof signals.$inferInsert;

// Granola public API — https://docs.granola.ai (base https://public-api.granola.ai/v1).
// The API exposes meeting notes with an AI-generated `summary_text`; it does NOT return
// pre-extracted action items. So we ingest the summary as a signal and let the extractor
// pull tasks from it (same path as every other source). The list endpoint only returns
// notes that already have a generated summary + transcript.
interface GranolaUser {
  name?: string;
  email?: string;
}

interface GranolaNoteSummary {
  id: string;
  title: string | null;
  owner?: GranolaUser;
  created_at: string;
  updated_at: string;
}

interface GranolaNoteDetail extends GranolaNoteSummary {
  web_url?: string;
  summary_text?: string;
  summary_markdown?: string | null;
}

interface ListNotesResponse {
  notes: GranolaNoteSummary[];
  hasMore: boolean;
  cursor: string | null;
}

const PAGE_SIZE = 30; // Granola max
const MAX_PAGES = 10; // safety cap per poll (≤300 notes); a 30s poll never approaches this

@Injectable()
export class GranolaService {
  private readonly logger = new Logger(GranolaService.name);
  private readonly apiKey: string;
  private readonly apiBase: string;

  constructor(
    @Inject(DB) private readonly db: DbType,
    @InjectQueue(QUEUES.SIGNALS_EXTRACT) private readonly extractQueue: Queue,
    private readonly config: ConfigService,
  ) {
    this.apiKey = config.get<string>('GRANOLA_API_KEY', '');
    this.apiBase = config.get<string>('GRANOLA_API_BASE', 'https://public-api.granola.ai/v1');
  }

  async poll(): Promise<void> {
    if (!this.apiKey) {
      this.logger.debug('Granola API key not configured — skipping poll');
      return;
    }

    const [state] = await this.db.select().from(granolaPollState).where(eq(granolaPollState.id, 'singleton'));
    // updated_after (not created_after): a note only appears once its AI summary exists,
    // which can land after creation — filtering by update time avoids missing late summaries.
    const since = state?.lastPolledAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000);

    let notes: GranolaNoteSummary[];
    try {
      notes = await this.fetchNotes(since);
    } catch (err: any) {
      this.logger.error(`Granola API error: ${err.message}`);
      return;
    }

    for (const note of notes) {
      try {
        await this.processNote(note);
      } catch (err: any) {
        this.logger.error(`Granola note ${note.id} failed: ${err.message}`);
      }
    }

    // Update poll state
    await this.db
      .insert(granolaPollState)
      .values({
        id: 'singleton',
        lastPolledAt: new Date(),
        lastSeenNoteId: notes.length > 0 ? notes[notes.length - 1].id : state?.lastSeenNoteId ?? null,
      })
      .onConflictDoUpdate({
        target: granolaPollState.id,
        set: {
          lastPolledAt: new Date(),
          lastSeenNoteId: notes.length > 0 ? notes[notes.length - 1].id : undefined,
        },
      });
  }

  /** Authenticated GET against the Granola API; throws on non-2xx. */
  private async get<T>(path: string): Promise<T> {
    const response = await fetch(`${this.apiBase}${path}`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Granola API returned ${response.status}: ${response.statusText}`);
    }

    return (await response.json()) as T;
  }

  /** List notes updated since `since`, following cursor pagination. */
  private async fetchNotes(since: Date): Promise<GranolaNoteSummary[]> {
    const all: GranolaNoteSummary[] = [];
    let cursor: string | null = null;

    for (let page = 0; page < MAX_PAGES; page++) {
      const params = new URLSearchParams({
        updated_after: since.toISOString(),
        page_size: String(PAGE_SIZE),
      });
      if (cursor) params.set('cursor', cursor);

      const data = await this.get<ListNotesResponse>(`/notes?${params.toString()}`);
      all.push(...(data.notes ?? []));

      if (!data.hasMore || !data.cursor) break;
      cursor = data.cursor;
    }

    return all;
  }

  /**
   * Each Granola note becomes one signal built from its AI summary (`summary_text`).
   * The extractor then pulls actionable tasks from it. Deduped per note id.
   */
  private async processNote(summary: GranolaNoteSummary): Promise<void> {
    const detail = await this.get<GranolaNoteDetail>(`/notes/${summary.id}`);
    const body = (detail.summary_text || detail.summary_markdown || '').trim();
    if (!body) return; // no summary yet → nothing to extract

    const signal: SignalInsert = {
      source: 'granola',
      subSource: 'granola',
      externalId: summary.id,
      dedupKey: `granola:${summary.id}`,
      status: 'pending',
      payload: {
        title: summary.title || 'Granola meeting note',
        body,
        author: summary.owner ? { name: summary.owner.name, email: summary.owner.email } : undefined,
        url: detail.web_url,
        occurredAt: summary.created_at,
        raw: { noteId: summary.id },
      },
    };

    const inserted = await this.db
      .insert(signals)
      .values(signal)
      .onConflictDoNothing({ target: signals.dedupKey })
      .returning({ id: signals.id });

    if (inserted.length > 0) {
      await this.extractQueue.add('extract', { signalId: inserted[0].id });
    }
  }
}

@Processor(QUEUES.GRANOLA_POLL)
export class GranolaPollProcessor extends WorkerHost {
  constructor(private readonly granolaService: GranolaService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    await this.granolaService.poll();
  }
}
