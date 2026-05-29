import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebClient } from '@slack/web-api';
import { signals } from '../../db/schema';

type SignalInsert = typeof signals.$inferInsert;

/**
 * Slack event types we handle:
 *
 * - message.im       → DM to the partner
 * - message.channels → channel message that mentions or replies to partner
 * - app_mention      → explicit @ mention
 * - reaction_added   → 🎯 reaction is a manual "make this a task" trigger
 */
@Injectable()
export class SlackIngestionService {
  private readonly logger = new Logger(SlackIngestionService.name);
  private readonly slack: WebClient;
  private readonly partnerSlackUserId: string;
  private readonly taskReactionEmoji: string;

  constructor(private readonly config: ConfigService) {
    this.slack = new WebClient(config.getOrThrow<string>('SLACK_BOT_TOKEN'));
    this.partnerSlackUserId = config.getOrThrow<string>('PARTNER_SLACK_USER_ID');
    this.taskReactionEmoji = config.get<string>('SLACK_TASK_REACTION', 'dart'); // 🎯
  }

  async toSignal(event: any): Promise<SignalInsert | null> {
    switch (event.type) {
      case 'message':
        return this.fromMessage(event);
      case 'app_mention':
        return this.fromMention(event);
      case 'reaction_added':
        return this.fromReaction(event);
      default:
        return null;
    }
  }

  private async fromMessage(event: any): Promise<SignalInsert | null> {
    // Ignore bot messages, edits, system messages
    if (event.bot_id || event.subtype) return null;
    // Ignore the partner's own outbound messages (unless we want to track commitments — TODO v2)
    if (event.user === this.partnerSlackUserId) return null;
    if (!event.text) return null;

    const isDm = event.channel_type === 'im';
    const subSource = isDm ? 'slack_dm' : 'slack_channel';

    const authorInfo = await this.lookupUser(event.user);
    const channelInfo = await this.lookupChannel(event.channel);

    return {
      source: 'slack',
      subSource,
      externalId: `${event.channel}:${event.ts}`,
      dedupKey: `slack:${event.channel}:${event.ts}`,
      status: 'pending',
      payload: {
        title: `Slack ${isDm ? 'DM' : `#${channelInfo?.name ?? 'channel'}`} from ${authorInfo?.name ?? 'unknown'}`,
        body: event.text,
        author: {
          name: authorInfo?.name,
          email: authorInfo?.email,
          externalId: event.user,
        },
        url: `https://slack.com/archives/${event.channel}/p${event.ts.replace('.', '')}`,
        threadId: event.thread_ts ?? event.ts,
        occurredAt: new Date(Number(event.ts) * 1000).toISOString(),
        raw: event,
      },
    };
  }

  private async fromMention(event: any): Promise<SignalInsert | null> {
    // app_mention fires when the bot is mentioned. We treat any @-mention of the partner
    // as a signal too (configured via message subscription); this handler covers the bot case.
    return this.fromMessage(event);
  }

  private async fromReaction(event: any): Promise<SignalInsert | null> {
    // Only trigger on the configured task emoji, and only when the PARTNER added it
    if (event.reaction !== this.taskReactionEmoji) return null;
    if (event.user !== this.partnerSlackUserId) return null;
    if (event.item.type !== 'message') return null;

    const { channel, ts } = event.item;
    // Fetch the original message
    const result = await this.slack.conversations.history({
      channel,
      latest: ts,
      inclusive: true,
      limit: 1,
    });
    const message = result.messages?.[0];
    if (!message?.text) return null;

    const authorInfo = await this.lookupUser(message.user!);
    const channelInfo = await this.lookupChannel(channel);

    return {
      source: 'slack',
      subSource: 'slack_reaction',
      externalId: `${channel}:${ts}:reaction`,
      dedupKey: `slack:${channel}:${ts}:reaction`,
      status: 'pending',
      payload: {
        title: `🎯 Reaction in #${channelInfo?.name ?? 'channel'} on message from ${authorInfo?.name ?? 'unknown'}`,
        body: message.text,
        author: {
          name: authorInfo?.name,
          email: authorInfo?.email,
          externalId: message.user,
        },
        url: `https://slack.com/archives/${channel}/p${ts.replace('.', '')}`,
        threadId: message.thread_ts ?? ts,
        occurredAt: new Date(Number(ts) * 1000).toISOString(),
        raw: { reactionEvent: event, originalMessage: message },
      },
    };
  }

  // Lookups should be cached — Slack rate limits these aggressively.
  // For v1, simple in-memory cache. For production, move to Redis.
  private userCache = new Map<string, { name: string; email?: string }>();
  private channelCache = new Map<string, { name: string }>();

  private async lookupUser(userId: string) {
    if (this.userCache.has(userId)) return this.userCache.get(userId);
    try {
      const result = await this.slack.users.info({ user: userId });
      const user = result.user;
      const info = {
        name: user?.real_name ?? user?.name ?? userId,
        email: user?.profile?.email,
      };
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
