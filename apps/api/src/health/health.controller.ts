import { Controller, Get, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/decorators/public.decorator';
import { DB, DbType } from '../db/db.module';
import { sql } from 'drizzle-orm';
import Redis from 'ioredis';
import { IntegrationHealthService } from './integration-health.service';

@Controller('health')
export class HealthController {
  private readonly redis: Redis;

  constructor(
    @Inject(DB) private readonly db: DbType,
    private readonly config: ConfigService,
    private readonly integrationHealth: IntegrationHealthService,
  ) {
    this.redis = new Redis({
      host: config.get<string>('REDIS_HOST', '127.0.0.1'),
      port: config.get<number>('REDIS_PORT', 6379),
      password: config.get<string>('REDIS_PASSWORD') || undefined,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
  }

  @Public()
  @Get()
  async check() {
    const results: Record<string, string> = {};

    try {
      await this.db.execute(sql`SELECT 1`);
      results.db = 'ok';
    } catch {
      results.db = 'error';
    }

    try {
      await this.redis.ping();
      results.redis = 'ok';
    } catch {
      results.redis = 'error';
    }

    return results;
  }

  /** Per-connector health + signal volume (auth-protected). Surfaced in Settings → Connectors. */
  @Get('integrations')
  async integrations() {
    // Only the data-source connectors — the LLM provider is core infra, not a connector.
    const CONNECTORS = new Set(['Slack', 'Notion', 'Gmail', 'Granola']);
    const statuses = (await this.integrationHealth.checkAll()).filter((s) => CONNECTORS.has(s.name));

    // Signals ingested per source (source is lowercase: slack/notion/gmail/granola). "Today" = since
    // local (Pacific) midnight so it matches the partner's day.
    const result: any = await this.db.execute(sql`
      SELECT source,
        count(*)::int AS all_time,
        count(*) FILTER (
          WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'America/Los_Angeles') AT TIME ZONE 'America/Los_Angeles'
        )::int AS today
      FROM signals
      GROUP BY source
    `);
    const counts = new Map<string, { today: number; allTime: number }>();
    for (const r of result.rows ?? []) {
      counts.set(String(r.source), { today: Number(r.today), allTime: Number(r.all_time) });
    }

    // Pause state — a connector is paused when its source_config row is disabled.
    const cfgResult: any = await this.db.execute(
      sql`SELECT source, enabled FROM source_config WHERE source IN ('slack', 'notion', 'gmail', 'granola')`,
    );
    const paused = new Map<string, boolean>();
    for (const r of cfgResult.rows ?? []) paused.set(String(r.source), r.enabled === false);

    return statuses.map((s) => {
      const key = s.name.toLowerCase();
      const c = counts.get(key) ?? { today: 0, allTime: 0 };
      return {
        ...s,
        signalsToday: c.today,
        signalsAllTime: c.allTime,
        paused: paused.get(key) ?? false,
        tracks: this.connectorTracks(s.name),
      };
    });
  }

  /** What each connector captures, with examples — built from env (partner name, reaction emoji). */
  private connectorTracks(name: string): { label: string; example: string }[] {
    const first = (this.config.get<string>('PARTNER_NAME') || 'you').trim().split(/\s+/)[0];
    const reactionName = this.config.get<string>('SLACK_TASK_REACTION', 'dart');
    // Slack stores the shortcode; render the glyph for common task-flag reactions, else `:name:`.
    const REACTION_EMOJI: Record<string, string> = {
      dart: '🎯', pushpin: '📌', round_pushpin: '📍', bookmark: '🔖', star: '⭐', star2: '🌟',
      white_check_mark: '✅', heavy_check_mark: '✔️', ballot_box_with_check: '☑️', eyes: '👀',
      inbox_tray: '📥', bell: '🔔', fire: '🔥', memo: '📝', clipboard: '📋', pushpin2: '📌',
    };
    const reaction = REACTION_EMOJI[reactionName] ?? `:${reactionName}:`;
    switch (name) {
      case 'Slack':
        return [
          { label: 'Mention @tctm', example: '“@tctm follow up with Acme on the term sheet”' },
          { label: `${reaction} reaction`, example: `React ${reaction} on any message to capture it as a task` },
          { label: `Mentions of ${first}`, example: `“${first}, can you pull the Salesforce report?” — by name, @tag, or a thread you’re in` },
        ];
      case 'Gmail':
        return [
          { label: 'Forwarded emails', example: 'Forward an email in — no note = captured as-is; a note on top becomes the task' },
          { label: 'Direct requests', example: '“Can you send the updated deck by Friday?”' },
        ];
      case 'Notion':
        return [
          { label: 'Comments', example: `“@${first} can you review the deck?” on a page` },
          { label: 'Mentions & assignments', example: `${first} is @mentioned in a page, or set as its Assignee / Owner` },
        ];
      case 'Granola':
        return [{ label: 'Meeting summaries', example: 'Action items from your meeting notes’ AI summary (from your tracked folders)' }];
      default:
        return [];
    }
  }
}
