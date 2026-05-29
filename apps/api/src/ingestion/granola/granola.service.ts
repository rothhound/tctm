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

interface GranolaNote {
  id: string;
  title: string;
  content?: string;
  created_at: string;
  action_items?: Array<{
    id: string;
    text: string;
    assignee?: string;
    completed?: boolean;
  }>;
}

@Injectable()
export class GranolaService {
  private readonly logger = new Logger(GranolaService.name);
  private readonly apiKey: string;
  private readonly apiBase = 'https://api.granola.ai/v1';

  constructor(
    @Inject(DB) private readonly db: DbType,
    @InjectQueue(QUEUES.SIGNALS_EXTRACT) private readonly extractQueue: Queue,
    private readonly config: ConfigService,
  ) {
    this.apiKey = config.get<string>('GRANOLA_API_KEY', '');
  }

  async poll(): Promise<void> {
    if (!this.apiKey) {
      this.logger.debug('Granola API key not configured — skipping poll');
      return;
    }

    const [state] = await this.db.select().from(granolaPollState).where(eq(granolaPollState.id, 'singleton'));
    const since = state?.lastPolledAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000);

    let notes: GranolaNote[];
    try {
      notes = await this.fetchNotes(since);
    } catch (err: any) {
      this.logger.error(`Granola API error: ${err.message}`);
      return;
    }

    for (const note of notes) {
      await this.processNote(note);
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

  private async fetchNotes(since: Date): Promise<GranolaNote[]> {
    const url = `${this.apiBase}/notes?since=${since.toISOString()}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Granola API returned ${response.status}: ${response.statusText}`);
    }

    const data: any = await response.json();
    return data.notes ?? data ?? [];
  }

  private async processNote(note: GranolaNote): Promise<void> {
    const actionItems = (note.action_items ?? []).filter((ai) => !ai.completed);
    if (actionItems.length === 0) return;

    for (const item of actionItems) {
      const signal: SignalInsert = {
        source: 'granola',
        subSource: 'granola',
        externalId: `${note.id}:${item.id}`,
        dedupKey: `granola:${note.id}:${item.id}`,
        status: 'pending',
        payload: {
          title: `Meeting note: ${note.title}`,
          body: item.text,
          author: item.assignee ? { name: item.assignee } : undefined,
          url: undefined,
          occurredAt: note.created_at,
          raw: { noteId: note.id, actionItem: item },
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
