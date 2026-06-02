import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebClient } from '@slack/web-api';

export type IntegrationState = 'ok' | 'configured' | 'inactive' | 'not_configured' | 'error';

export interface IntegrationStatus {
  name: string;
  state: IntegrationState;
  detail: string;
}

const LIVE_CHECK_TIMEOUT_MS = 5000;

/**
 * On boot, performs a lightweight "handshake" against each connector and logs whether it's
 * operational. Live checks where cheap & safe (Slack auth.test, Granola list-notes ping);
 * config-presence / known-status otherwise. Never blocks startup (fire-and-forget) and never
 * throws — a connector being down must not stop the app.
 */
@Injectable()
export class IntegrationHealthService implements OnApplicationBootstrap {
  private readonly logger = new Logger('IntegrationHealth');

  constructor(private readonly config: ConfigService) {}

  onApplicationBootstrap(): void {
    // Fire-and-forget: don't block boot on network round-trips.
    void this.logHandshake();
  }

  async logHandshake(): Promise<void> {
    const results = await this.checkAll();
    this.logger.log('─── Connector handshake ───');
    for (const r of results) {
      const icon = r.state === 'ok' ? '✓' : r.state === 'error' ? '✗' : '•';
      const line = `${r.name.padEnd(9)} ${icon} ${r.state.toUpperCase().padEnd(15)} ${r.detail}`;
      if (r.state === 'error') this.logger.warn(line);
      else this.logger.log(line);
    }
    this.logger.log('───────────────────────────');
  }

  /** Run every connector check in parallel; each is self-contained and never rejects. */
  async checkAll(): Promise<IntegrationStatus[]> {
    return Promise.all([
      this.checkAnthropic(),
      this.checkOpenAi(),
      this.checkSlack(),
      this.checkNotion(),
      this.checkGmail(),
      this.checkGranola(),
    ]);
  }

  /** Which LLM backend LlmService will use (default anthropic). */
  private activeLlmProvider(): string {
    return (this.config.get<string>('LLM_PROVIDER', 'anthropic') ?? 'anthropic').trim().toLowerCase();
  }

  private checkAnthropic(): IntegrationStatus {
    const active = this.activeLlmProvider() === 'anthropic';
    const role = active ? 'ACTIVE' : 'swap-ready';
    return this.config.get<string>('ANTHROPIC_API_KEY')
      ? { name: 'Anthropic', state: 'configured', detail: `API key set — ${role} (extraction/judge)` }
      : {
          name: 'Anthropic',
          state: 'not_configured',
          detail: `ANTHROPIC_API_KEY missing${active ? ' — ACTIVE provider, extraction disabled' : ''}`,
        };
  }

  private checkOpenAi(): IntegrationStatus {
    const active = this.activeLlmProvider() === 'openai';
    const role = active ? 'ACTIVE' : 'swap-ready';
    return this.config.get<string>('OPENAI_API_KEY')
      ? { name: 'OpenAI', state: 'configured', detail: `API key set — ${role} (extraction/judge)` }
      : {
          name: 'OpenAI',
          state: 'not_configured',
          detail: `OPENAI_API_KEY missing${active ? ' — ACTIVE provider, extraction disabled' : ''}`,
        };
  }

  /** Live: Slack auth.test confirms the bot token is valid. */
  private async checkSlack(): Promise<IntegrationStatus> {
    const token = this.config.get<string>('SLACK_BOT_TOKEN');
    if (!token) return { name: 'Slack', state: 'not_configured', detail: 'SLACK_BOT_TOKEN missing' };
    try {
      const res: any = await new WebClient(token, { timeout: LIVE_CHECK_TIMEOUT_MS }).auth.test();
      return { name: 'Slack', state: 'ok', detail: `connected as ${res.user} in workspace ${res.team}` };
    } catch (err: any) {
      return { name: 'Slack', state: 'error', detail: `auth.test failed: ${err?.data?.error ?? err?.message ?? 'unknown'}` };
    }
  }

  /** Inbound webhook — no outbound API to ping, so report config presence. */
  private checkNotion(): IntegrationStatus {
    if (!this.config.get<string>('NOTION_VERIFICATION_TOKEN'))
      return { name: 'Notion', state: 'not_configured', detail: 'NOTION_VERIFICATION_TOKEN missing' };
    if (!this.config.get<string>('PARTNER_NOTION_USER_ID'))
      return { name: 'Notion', state: 'inactive', detail: 'PARTNER_NOTION_USER_ID missing — no mentions/assignments detected' };
    return { name: 'Notion', state: 'configured', detail: 'webhook token + partner id set (inbound; no live check)' };
  }

  private checkGmail(): IntegrationStatus {
    const subject = this.config.get<string>('GMAIL_IMPERSONATE_SUBJECT');
    if (this.config.get<string>('GMAIL_SA_KEY') && subject)
      return { name: 'Gmail', state: 'configured', detail: `domain-wide delegation as ${subject}` };
    if (this.config.get<string>('GOOGLE_CLIENT_ID') && this.config.get<string>('GMAIL_REFRESH_TOKEN'))
      return { name: 'Gmail', state: 'configured', detail: 'OAuth refresh-token mode' };
    if (this.config.get<string>('GOOGLE_CLIENT_ID'))
      return { name: 'Gmail', state: 'inactive', detail: 'no GMAIL_SA_KEY+SUBJECT or GMAIL_REFRESH_TOKEN — ingestion inactive' };
    return { name: 'Gmail', state: 'not_configured', detail: 'GOOGLE_CLIENT_ID / GMAIL_SA_KEY missing' };
  }

  /** Live: hit the Granola list endpoint to confirm key + base URL are good. */
  private async checkGranola(): Promise<IntegrationStatus> {
    const key = this.config.get<string>('GRANOLA_API_KEY');
    if (!key) return { name: 'Granola', state: 'not_configured', detail: 'GRANOLA_API_KEY missing — poll disabled' };
    const base = this.config.get<string>('GRANOLA_API_BASE', 'https://public-api.granola.ai/v1');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LIVE_CHECK_TIMEOUT_MS);
    try {
      const res = await fetch(`${base}/notes?page_size=1`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: controller.signal,
      });
      if (res.ok) return { name: 'Granola', state: 'ok', detail: `${base} reachable (${res.status})` };
      return { name: 'Granola', state: 'error', detail: `${res.status} ${res.statusText} from ${base}` };
    } catch (err: any) {
      return { name: 'Granola', state: 'error', detail: `request failed: ${err?.message ?? 'unknown'}` };
    } finally {
      clearTimeout(timer);
    }
  }
}
