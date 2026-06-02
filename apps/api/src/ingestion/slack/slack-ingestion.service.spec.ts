import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SlackIngestionService } from './slack-ingestion.service';
const dmEvent = require('../../../test/fixtures/slack/message-dm.json');
const channelEvent = require('../../../test/fixtures/slack/message-channel.json');
const reactionEvent = require('../../../test/fixtures/slack/reaction-added.json');

const PARTNER = 'U0123456789';
const OTHER = 'U9876543210';

// Mock the Slack WebClient. history → context window / reacted message; replies → thread (with the
// partner present, so thread-anchor resolves true).
jest.mock('@slack/web-api', () => ({
  WebClient: jest.fn().mockImplementation(() => ({
    users: {
      info: jest.fn().mockResolvedValue({
        user: { real_name: 'John Doe', name: 'jdoe', profile: { email: 'john@example.com' } },
      }),
    },
    conversations: {
      info: jest.fn().mockResolvedValue({ channel: { name: 'general' } }),
      history: jest.fn().mockResolvedValue({
        messages: [
          { text: 'Could you review the deck and share feedback?', user: 'U9876543210', ts: '1716100000.000300' },
          // channel noise that must be filtered out of the context window:
          { subtype: 'channel_join', text: '<@U1> has joined the channel', user: 'U1', ts: '1716100000.000250' },
          { bot_id: 'B1', text: 'tctm bot posted something', user: 'U2', ts: '1716100000.000240' },
        ],
      }),
      replies: jest.fn().mockResolvedValue({
        messages: [
          { text: 'kicking off this thread', user: 'U9876543210', ts: '1716100000.000050' },
          { text: 'sounds good, on it', user: 'U0123456789', ts: '1716100000.000060' },
        ],
      }),
    },
  })),
}));

describe('SlackIngestionService', () => {
  let service: SlackIngestionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlackIngestionService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) => {
              if (key === 'SLACK_BOT_TOKEN') return 'xoxb-test';
              if (key === 'PARTNER_SLACK_USER_ID') return PARTNER;
              throw new Error(`Unknown key: ${key}`);
            },
            get: (key: string, def: string) => {
              if (key === 'SLACK_TASK_REACTION') return 'dart';
              if (key === 'PARTNER_NAME') return 'Jane Doe';
              if (key === 'PARTNER_ALIASES') return 'JD,Janie';
              return def;
            },
          },
        },
      ],
    }).compile();

    service = module.get<SlackIngestionService>(SlackIngestionService);
  });

  describe('@tctm mention (explicit capture, partner-only)', () => {
    const mention = {
      type: 'app_mention',
      user: PARTNER,
      text: '<@UBOT> make a task from this',
      channel: 'C0123456789',
      ts: '1716100000.000200',
      event_ts: '1716100000.000200',
    };

    it('captures when the partner @tctm-mentions, pulling the context window', async () => {
      const signal = await service.toSignal(mention);

      expect(signal).not.toBeNull();
      expect(signal!.source).toBe('slack');
      expect(signal!.subSource).toBe('slack_capture');
      expect(signal!.dedupKey).toBe('slack:C0123456789:1716100000.000200:capture');
      // Body is assembled from the surrounding messages, not the lone "@tctm" line
      expect(signal!.payload.body).toContain('review the deck');
      // …and channel noise (joins, bot posts) is excluded from the window
      expect(signal!.payload.body).not.toContain('has joined');
      expect(signal!.payload.body).not.toContain('bot posted');
      // …and the triggering message is marked as the focus for the extractor
      expect(signal!.payload.body).toContain('Flagged message');
    });

    it('ignores @tctm from anyone other than the partner', async () => {
      const signal = await service.toSignal({ ...mention, user: OTHER });
      expect(signal).toBeNull();
    });

    it('ignores bot / subtype mention events', async () => {
      expect(await service.toSignal({ ...mention, bot_id: 'B1' })).toBeNull();
      expect(await service.toSignal({ ...mention, subtype: 'message_changed' })).toBeNull();
    });
  });

  describe('🎯 reaction (explicit capture, partner-only)', () => {
    it('captures when the partner reacts with the target emoji', async () => {
      const signal = await service.toSignal(reactionEvent);

      expect(signal).not.toBeNull();
      expect(signal!.subSource).toBe('slack_reaction');
      expect(signal!.dedupKey).toContain(':reaction');
      expect(signal!.payload.body).toContain('review the deck');
    });

    it('ignores the wrong emoji', async () => {
      expect(await service.toSignal({ ...reactionEvent, reaction: 'thumbsup' })).toBeNull();
    });

    it('ignores reactions from non-partner users', async () => {
      expect(await service.toSignal({ ...reactionEvent, user: OTHER })).toBeNull();
    });

    it('ignores reactions on non-message items', async () => {
      const signal = await service.toSignal({ ...reactionEvent, item: { type: 'file', file: 'F123' } });
      expect(signal).toBeNull();
    });
  });

  describe('passive channel message (anchored on the partner)', () => {
    it('captures a channel message that @tags the partner', async () => {
      const signal = await service.toSignal(channelEvent); // text tags <@U0123456789>

      expect(signal).not.toBeNull();
      expect(signal!.subSource).toBe('slack_channel');
      expect(signal!.dedupKey).toBe('slack:C0123456789:1716100000.000200');
    });

    it('captures a channel message that names the partner (alias, no @tag)', async () => {
      const signal = await service.toSignal({
        type: 'message',
        channel: 'C0123456789',
        channel_type: 'channel',
        user: OTHER,
        text: 'Can Janie take a look at the deck this week?',
        ts: '1716100000.000201',
      });

      expect(signal).not.toBeNull();
      expect(signal!.subSource).toBe('slack_channel');
    });

    it('captures a message in a thread the partner participates in (no tag/name)', async () => {
      const signal = await service.toSignal({
        type: 'message',
        channel: 'C0123456789',
        channel_type: 'channel',
        user: OTHER,
        text: 'bumping this for visibility',
        ts: '1716100000.000202',
        thread_ts: '1716100000.000050',
      });

      expect(signal).not.toBeNull();
      expect(signal!.subSource).toBe('slack_channel');
    });

    it('ignores a channel message with no anchor on the partner', async () => {
      const signal = await service.toSignal({
        type: 'message',
        channel: 'C0123456789',
        channel_type: 'channel',
        user: OTHER,
        text: 'anyone up for lunch later?',
        ts: '1716100000.000203',
      });
      expect(signal).toBeNull();
    });

    it("never captures the partner's own message", async () => {
      const signal = await service.toSignal({ ...channelEvent, user: PARTNER });
      expect(signal).toBeNull();
    });

    it('ignores DMs to the bot', async () => {
      const signal = await service.toSignal(dmEvent); // channel_type: 'im'
      expect(signal).toBeNull();
    });

    it('ignores bot / subtype / empty messages', async () => {
      expect(await service.toSignal({ ...channelEvent, bot_id: 'B1' })).toBeNull();
      expect(await service.toSignal({ ...channelEvent, subtype: 'message_changed' })).toBeNull();
      expect(await service.toSignal({ ...channelEvent, text: '' })).toBeNull();
    });
  });

  describe('unknown event types', () => {
    it('returns null', async () => {
      expect(await service.toSignal({ type: 'channel_join' })).toBeNull();
    });
  });
});
