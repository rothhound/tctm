import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebClient } from '@slack/web-api';
import { signals } from '../../db/schema';

type SignalInsert = typeof signals.$inferInsert;

const CONTEXT_WINDOW = 10; // messages of lead-up context pulled around a trigger/anchor

// Slack message subtypes that are channel noise, not conversation (joins, topic changes, bot posts).
// Excluded from the context window so it isn't dominated by "X has joined the channel".
const SYSTEM_SUBTYPES = new Set([
  'channel_join', 'channel_leave', 'channel_topic', 'channel_purpose', 'channel_name',
  'channel_archive', 'channel_unarchive', 'group_join', 'group_leave', 'bot_message', 'tombstone',
]);

/** A real human message worth including in a context window. */
function isConversational(m: any): boolean {
  return Boolean(m?.text) && !m.bot_id && !(m.subtype && SYSTEM_SUBTYPES.has(m.subtype));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Slack capture — the partner curates what becomes a task. Three paths (bot must be in the channel):
 *
 *  - app_mention (@tctm)   → explicit capture, PARTNER ONLY
 *  - reaction_added (🎯)   → explicit capture, PARTNER ONLY
 *  - message.channels      → passive, only when it ANCHORS on the partner (a tagged @mention,
 *                            the partner's name/alias in the text, or a thread the partner is in)
 *                            and is from someone else. The partner's own messages are never
 *                            captured passively.
 *
 * Every path extracts from a CONTEXT WINDOW (the thread, or the last N messages) so a lone
 * fragment ("LOL") is never a task and a named-but-not-tagged request ("…Gianfranco?") is caught.
 * DMs to the bot are ignored; the partner's 1:1 DMs are out of reach of a bot token.
 */
@Injectable()
export class SlackIngestionService {
  private readonly logger = new Logger(SlackIngestionService.name);
  private readonly slack: WebClient;
  private readonly partnerSlackUserId: string;
  private readonly taskReactionEmoji: string;
  /** Lowercased name/alias strings (from env) that mark a message as "about the partner". */
  private readonly partnerNameMatchers: string[];

  constructor(private readonly config: ConfigService) {
    this.slack = new WebClient(config.getOrThrow<string>('SLACK_BOT_TOKEN'));
    this.partnerSlackUserId = config.getOrThrow<string>('PARTNER_SLACK_USER_ID');
    this.taskReactionEmoji = config.get<string>('SLACK_TASK_REACTION', 'dart'); // 🎯

    // Identity is fully env-driven — PARTNER_NAME + PARTNER_ALIASES (comma-separated). No hardcoding.
    this.partnerNameMatchers = [
      config.get<string>('PARTNER_NAME', ''),
      ...(config.get<string>('PARTNER_ALIASES', '') ?? '').split(','),
    ]
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 1);

    // One-time visibility: confirms PARTNER_ALIASES actually loaded (set LOG_LEVEL=debug for per-event drops).
    this.logger.log(
      `Slack capture ready — partner=${this.partnerSlackUserId}, reaction=:${this.taskReactionEmoji}:, ` +
        `name matchers=[${this.partnerNameMatchers.join(', ') || 'NONE — set PARTNER_NAME/PARTNER_ALIASES'}]`,
    );
  }

  async toSignal(event: any): Promise<SignalInsert | null> {
    switch (event.type) {
      case 'app_mention':
        return this.fromExplicitCapture(event);
      case 'reaction_added':
        return this.fromReaction(event);
      case 'message':
        return this.fromChannelAnchor(event);
      default:
        return null;
    }
  }

  // ── @tctm mention: explicit, partner-only ───────────────────────────────
  private async fromExplicitCapture(event: any): Promise<SignalInsert | null> {
    if (event.bot_id || event.subtype) return null;
    if (event.user !== this.partnerSlackUserId) {
      this.logger.debug(`@tctm mention by non-partner ${event.user} — ignored`);
      return null;
    }

    const { channel, ts } = event;
    const body = await this.buildWindowBody(channel, ts, event.thread_ts);
    if (!body) return null;

    const channelInfo = await this.lookupChannel(channel);
    this.logger.log(`@tctm capture by partner in #${channelInfo?.name ?? channel} → slack_capture`);
    return this.buildSignal({
      subSource: 'slack_capture',
      idSuffix: 'capture',
      channel,
      ts,
      threadTs: event.thread_ts,
      title: `@tctm capture in #${channelInfo?.name ?? 'channel'}`,
      body,
      authorUserId: event.user,
      raw: event,
    });
  }

  // ── 🎯 reaction: explicit, partner-only ─────────────────────────────────
  private async fromReaction(event: any): Promise<SignalInsert | null> {
    if (event.reaction !== this.taskReactionEmoji) return null; // silent: most reactions aren't the trigger
    if (event.user !== this.partnerSlackUserId) {
      this.logger.debug(`:${event.reaction}: reaction by non-partner ${event.user} — ignored`);
      return null;
    }
    if (event.item?.type !== 'message') return null;

    const { channel, ts } = event.item;
    const reacted = await this.fetchMessage(channel, ts);
    if (!reacted?.text) {
      this.logger.warn(`🎯 reaction: could not read reacted message ${channel}/${ts} (bot not in channel / scope / deleted) — skipped`);
      return null;
    }

    const body = await this.buildWindowBody(channel, ts, reacted.thread_ts);
    if (!body) return null;

    const channelInfo = await this.lookupChannel(channel);
    this.logger.log(`🎯 capture by partner in #${channelInfo?.name ?? channel} → slack_reaction`);
    return this.buildSignal({
      subSource: 'slack_reaction',
      idSuffix: 'reaction',
      channel,
      ts,
      threadTs: reacted.thread_ts,
      title: `🎯 capture in #${channelInfo?.name ?? 'channel'}`,
      body,
      authorUserId: reacted.user,
      raw: { reactionEvent: event, reactedMessage: reacted },
    });
  }

  // ── Passive channel message: only when it anchors on the partner ─────────
  private async fromChannelAnchor(event: any): Promise<SignalInsert | null> {
    if (event.bot_id || event.subtype) return null;
    if (event.user === this.partnerSlackUserId) {
      this.logger.debug(`Slack channel msg from partner (self) — not passively captured`);
      return null;
    }
    if (event.channel_type === 'im') return null; // DMs to the bot are off
    if (!event.text) return null;

    const byTag = this.mentionsPartnerByTag(event.text);
    const byName = !byTag && this.mentionsPartnerByName(event.text);
    const byThread =
      !byTag && !byName && event.thread_ts ? await this.partnerInThread(event.channel, event.thread_ts) : false;

    if (!byTag && !byName && !byThread) {
      this.logger.debug(
        `Slack channel msg in ${event.channel} from ${event.user} — no partner anchor (tag/name/thread), skipped`,
      );
      return null;
    }
    const anchor = byTag ? 'tag' : byName ? 'name/alias' : 'thread';

    // Directly addressed (someone @mentioned or named the partner) is a strong "this is for you"
    // signal → lenient slack_mention. Merely being in the thread is weaker → strict slack_channel.
    const directlyAddressed = byTag || byName;
    const subSource = directlyAddressed ? 'slack_mention' : 'slack_channel';

    const { channel, ts } = event;
    const body = await this.buildWindowBody(channel, ts, event.thread_ts);
    if (!body) return null;

    const channelInfo = await this.lookupChannel(channel);
    this.logger.log(`Slack channel msg anchored by ${anchor} in #${channelInfo?.name ?? channel} → ${subSource}`);
    return this.buildSignal({
      subSource,
      channel,
      ts,
      threadTs: event.thread_ts,
      title: directlyAddressed
        ? `Slack #${channelInfo?.name ?? 'channel'} — request mentioning you`
        : `Slack #${channelInfo?.name ?? 'channel'} — thread you're in`,
      body,
      authorUserId: event.user,
      raw: event,
    });
  }

  // ── Partner matching (env-driven) ───────────────────────────────────────
  private mentionsPartnerByTag(text: string): boolean {
    return text.includes(`<@${this.partnerSlackUserId}>`);
  }

  private mentionsPartnerByName(text: string): boolean {
    if (this.partnerNameMatchers.length === 0) return false;
    const lower = text.toLowerCase();
    return this.partnerNameMatchers.some((name) => new RegExp(`\\b${escapeRegExp(name)}\\b`).test(lower));
  }

  private async partnerInThread(channel: string, threadTs: string): Promise<boolean> {
    const msgs = await this.fetchThread(channel, threadTs);
    return msgs.some((m) => m.user === this.partnerSlackUserId);
  }

  // ── Context window ──────────────────────────────────────────────────────
  /**
   * Chronological "<author>: <text>" transcript around the trigger: the whole thread if threaded,
   * else the last CONTEXT_WINDOW messages up to (and including) `ts`.
   */
  private async buildWindowBody(channel: string, triggerTs: string, threadTs?: string): Promise<string | null> {
    const messages = threadTs
      ? await this.fetchThread(channel, threadTs)
      : await this.fetchRecent(channel, triggerTs);

    // Mark the trigger message (@tctm / 🎯 / anchor) as the FOCUS, with everything else as
    // background. Otherwise, in a busy channel, the extractor captures whatever unrelated request
    // was repeated most in the surrounding window instead of the message you actually flagged.
    // A terse trigger ("LOL", "👍") still resolves because the context lines remain available.
    let flagged: string | null = null;
    const context: string[] = [];
    for (const m of messages) {
      if (!isConversational(m)) continue; // drop joins/leaves/topic-changes/bot posts
      const who = (await this.lookupUser(m.user ?? ''))?.name ?? m.user ?? 'unknown';
      const line = `${who}: ${m.text}`;
      if (m.ts === triggerTs) flagged = line;
      else context.push(line);
    }
    if (!flagged) flagged = context.pop() ?? null; // fallback: newest line is the trigger
    if (!flagged) return null;

    if (context.length === 0) return `Flagged message:\n${flagged}`;
    return [
      'Earlier conversation (context only — extract a task from these ONLY if the flagged message refers back to them):',
      ...context,
      '',
      'Flagged message (capture the task this indicates):',
      flagged,
    ].join('\n');
  }

  private async fetchMessage(channel: string, ts: string): Promise<any | null> {
    try {
      const r = await this.slack.conversations.history({ channel, latest: ts, inclusive: true, limit: 1 });
      return r.messages?.[0] ?? null;
    } catch (err) {
      this.logger.warn(`Slack fetchMessage failed (${channel}/${ts}): ${(err as Error).message}`);
      return null;
    }
  }

  private async fetchRecent(channel: string, ts: string): Promise<any[]> {
    try {
      const r = await this.slack.conversations.history({ channel, latest: ts, inclusive: true, limit: CONTEXT_WINDOW });
      return (r.messages ?? []).slice().reverse(); // history is newest-first → chronological
    } catch (err) {
      this.logger.warn(`Slack fetchRecent failed (${channel}): ${(err as Error).message}`);
      return [];
    }
  }

  private async fetchThread(channel: string, threadTs: string): Promise<any[]> {
    try {
      const r = await this.slack.conversations.replies({ channel, ts: threadTs, limit: 50 });
      return r.messages ?? [];
    } catch (err) {
      this.logger.warn(`Slack fetchThread failed (${channel}/${threadTs}): ${(err as Error).message}`);
      return [];
    }
  }

  private async buildSignal(args: {
    subSource: string;
    idSuffix?: string;
    channel: string;
    ts: string;
    threadTs?: string;
    title: string;
    body: string;
    authorUserId?: string;
    raw: unknown;
  }): Promise<SignalInsert> {
    const { subSource, idSuffix, channel, ts, threadTs, title, body, authorUserId, raw } = args;
    const author = authorUserId ? await this.lookupUser(authorUserId) : undefined;
    const externalId = `${channel}:${ts}${idSuffix ? `:${idSuffix}` : ''}`;
    return {
      source: 'slack',
      subSource,
      externalId,
      dedupKey: `slack:${externalId}`,
      status: 'pending',
      payload: {
        title,
        body,
        author: author ? { name: author.name, email: author.email, externalId: authorUserId } : undefined,
        url: `https://slack.com/archives/${channel}/p${String(ts).replace('.', '')}`,
        threadId: threadTs ?? ts,
        occurredAt: new Date(Number(ts) * 1000).toISOString(),
        raw,
      },
    };
  }

  // Lookups are cached — Slack rate-limits these. In-memory for now; move to Redis for production.
  private userCache = new Map<string, { name: string; email?: string }>();
  private channelCache = new Map<string, { name: string }>();

  private async lookupUser(userId: string) {
    if (!userId) return undefined;
    if (this.userCache.has(userId)) return this.userCache.get(userId);
    try {
      const result = await this.slack.users.info({ user: userId });
      const user = result.user;
      const info = { name: user?.real_name ?? user?.name ?? userId, email: user?.profile?.email };
      this.userCache.set(userId, info);
      return info;
    } catch (err) {
      this.logger.warn(`Failed to look up Slack user ${userId}: ${(err as Error).message}`);
      return undefined;
    }
  }

  private async lookupChannel(channelId: string) {
    if (this.channelCache.has(channelId)) return this.channelCache.get(channelId);
    try {
      const result = await this.slack.conversations.info({ channel: channelId });
      const info = { name: result.channel?.name ?? channelId };
      this.channelCache.set(channelId, info);
      return info;
    } catch (err) {
      this.logger.warn(`Failed to look up Slack channel ${channelId}: ${(err as Error).message}`);
      return undefined;
    }
  }
}
