import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SlackIngestionService } from './slack-ingestion.service';
const dmEvent = require('../../../test/fixtures/slack/message-dm.json');
const channelEvent = require('../../../test/fixtures/slack/message-channel.json');
const reactionEvent = require('../../../test/fixtures/slack/reaction-added.json');

// Mock the Slack WebClient
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
        messages: [{ text: 'Original message to make a task from', user: 'U9876543210', ts: '1716100000.000300' }],
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
              if (key === 'PARTNER_SLACK_USER_ID') return 'U0123456789';
              throw new Error(`Unknown key: ${key}`);
            },
            get: (key: string, def: string) => {
              if (key === 'SLACK_TASK_REACTION') return 'dart';
              return def;
            },
          },
        },
      ],
    }).compile();

    service = module.get<SlackIngestionService>(SlackIngestionService);
  });

  describe('DM messages', () => {
    it('creates a signal from a DM', async () => {
      const signal = await service.toSignal(dmEvent);

      expect(signal).not.toBeNull();
      expect(signal!.source).toBe('slack');
      expect(signal!.subSource).toBe('slack_dm');
      expect(signal!.dedupKey).toBe('slack:D0123456789:1716100000.000100');
      expect(signal!.payload.body).toContain('cap table');
    });

    it('filters out bot messages', async () => {
      const signal = await service.toSignal({ ...dmEvent, bot_id: 'B123' });
      expect(signal).toBeNull();
    });

    it('filters out partner own outbound messages', async () => {
      const signal = await service.toSignal({ ...dmEvent, user: 'U0123456789' });
      expect(signal).toBeNull();
    });

    it('filters out message edits (subtype)', async () => {
      const signal = await service.toSignal({ ...dmEvent, subtype: 'message_changed' });
      expect(signal).toBeNull();
    });

    it('filters out empty messages', async () => {
      const signal = await service.toSignal({ ...dmEvent, text: '' });
      expect(signal).toBeNull();
    });
  });

  describe('channel messages', () => {
    it('creates a signal from a channel message', async () => {
      const signal = await service.toSignal(channelEvent);

      expect(signal).not.toBeNull();
      expect(signal!.subSource).toBe('slack_channel');
    });
  });

  describe('reactions', () => {
    it('creates a signal from a target emoji reaction by the partner', async () => {
      const signal = await service.toSignal(reactionEvent);

      expect(signal).not.toBeNull();
      expect(signal!.subSource).toBe('slack_reaction');
      expect(signal!.dedupKey).toContain('reaction');
    });

    it('ignores reactions with wrong emoji', async () => {
      const signal = await service.toSignal({ ...reactionEvent, reaction: 'thumbsup' });
      expect(signal).toBeNull();
    });

    it('ignores reactions from non-partner users', async () => {
      const signal = await service.toSignal({ ...reactionEvent, user: 'U9999999999' });
      expect(signal).toBeNull();
    });

    it('ignores reactions on non-message items', async () => {
      const signal = await service.toSignal({
        ...reactionEvent,
        item: { type: 'file', file: 'F123' },
      });
      expect(signal).toBeNull();
    });
  });

  describe('unknown event types', () => {
    it('returns null for unknown event types', async () => {
      const signal = await service.toSignal({ type: 'channel_join' });
      expect(signal).toBeNull();
    });
  });
});
