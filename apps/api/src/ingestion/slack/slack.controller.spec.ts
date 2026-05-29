import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { createHmac } from 'crypto';
import { SlackController } from './slack.controller';
import { SlackIngestionService } from './slack-ingestion.service';
import { DB } from '../../db/db.module';
import { QUEUES } from '../../shared/queues.module';
const urlVerification = require('../../../test/fixtures/slack/url-verification.json');

describe('SlackController', () => {
  let controller: SlackController;
  let mockSlackIngestion: Partial<SlackIngestionService>;
  const signingSecret = 'test-signing-secret';

  function makeSignature(timestamp: string, body: string): string {
    const baseString = `v0:${timestamp}:${body}`;
    return `v0=${createHmac('sha256', signingSecret).update(baseString).digest('hex')}`;
  }

  beforeEach(async () => {
    mockSlackIngestion = {
      toSignal: jest.fn().mockResolvedValue({
        source: 'slack',
        subSource: 'slack_dm',
        externalId: 'C:ts',
        dedupKey: 'slack:C:ts',
        status: 'pending',
        payload: { title: 'DM', body: 'test', occurredAt: '2026-05-19T10:00:00Z', raw: {} },
      }),
    };

    const mockDb = {
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      onConflictDoNothing: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([{ id: 'sig-001' }]),
    };

    const mockQueue = { add: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SlackController],
      providers: [
        { provide: SlackIngestionService, useValue: mockSlackIngestion },
        { provide: DB, useValue: mockDb },
        { provide: getQueueToken(QUEUES.SIGNALS_EXTRACT), useValue: mockQueue },
        {
          provide: ConfigService,
          useValue: { getOrThrow: () => signingSecret, get: () => signingSecret },
        },
      ],
    }).compile();

    controller = module.get<SlackController>(SlackController);
  });

  it('responds to URL verification challenge', async () => {
    const req = {} as any;
    const result = await controller.handleEvent(req, '', '', urlVerification);
    expect(result).toEqual({ challenge: 'test-challenge-token-12345' });
  });

  it('rejects request with missing signature headers', async () => {
    const body = { type: 'event_callback', event: {} };
    const rawBody = JSON.stringify(body);
    const req = { rawBody } as any;

    await expect(
      controller.handleEvent(req, '', '', body),
    ).rejects.toThrow(HttpException);
  });

  it('rejects request with timestamp older than 5 minutes', async () => {
    const body = { type: 'event_callback', event: {} };
    const rawBody = JSON.stringify(body);
    const oldTimestamp = String(Math.floor(Date.now() / 1000) - 400);
    const sig = makeSignature(oldTimestamp, rawBody);
    const req = { rawBody } as any;

    await expect(
      controller.handleEvent(req, sig, oldTimestamp, body),
    ).rejects.toThrow(HttpException);
  });

  it('rejects request with invalid HMAC signature', async () => {
    const body = { type: 'event_callback', event: {} };
    const rawBody = JSON.stringify(body);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const req = { rawBody } as any;

    await expect(
      controller.handleEvent(req, 'v0=bad_signature', timestamp, body),
    ).rejects.toThrow(HttpException);
  });

  it('accepts valid signed event_callback and returns ok', async () => {
    const event = { type: 'message', channel: 'D123', user: 'U456', text: 'hi', ts: '123.456', channel_type: 'im' };
    const body = { type: 'event_callback', event };
    const rawBody = JSON.stringify(body);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const sig = makeSignature(timestamp, rawBody);
    const req = { rawBody } as any;

    const result = await controller.handleEvent(req, sig, timestamp, body);
    expect(result).toEqual({ ok: true });
  });
});
