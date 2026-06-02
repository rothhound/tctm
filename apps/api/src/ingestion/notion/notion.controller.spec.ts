import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { createHmac } from 'crypto';
import { NotionController } from './notion.controller';
import { NotionService } from './notion.service';
import { DB } from '../../db/db.module';
import { QUEUES } from '../../shared/queues.module';

describe('NotionController', () => {
  let controller: NotionController;
  const verificationToken = 'test-notion-secret';

  beforeEach(async () => {
    const mockNotionService = {
      toSignal: jest.fn().mockResolvedValue({
        source: 'notion', subSource: 'notion_mention', externalId: 'page-1',
        dedupKey: 'notion:page-1:ts', status: 'pending',
        payload: { title: 'Page', body: 'content', occurredAt: '2026-05-19T10:00:00Z', raw: {} },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotionController],
      providers: [
        { provide: NotionService, useValue: mockNotionService },
        {
          provide: DB,
          useValue: {
            insert: jest.fn().mockReturnValue({
              values: jest.fn().mockReturnValue({
                onConflictDoNothing: jest.fn().mockReturnValue({
                  returning: jest.fn().mockResolvedValue([{ id: 'sig-001' }]),
                }),
              }),
            }),
          },
        },
        { provide: getQueueToken(QUEUES.SIGNALS_EXTRACT), useValue: { add: jest.fn() } },
        { provide: ConfigService, useValue: { get: () => verificationToken } },
      ],
    }).compile();

    controller = module.get<NotionController>(NotionController);
  });

  it('returns ok for an authenticated event without a handled type', async () => {
    const rawBody = '{}';
    const sig = createHmac('sha256', verificationToken).update(rawBody).digest('hex');
    const result = await controller.handleWebhook({ rawBody } as any, sig, {});
    expect(result).toEqual({ ok: true });
  });

  it('rejects a real event with no signature header (fail-closed)', async () => {
    const body = { type: 'page.content_updated', page: { id: 'page-1' } };
    const rawBody = JSON.stringify(body);
    await expect(
      controller.handleWebhook({ rawBody } as any, undefined, body),
    ).rejects.toThrow(HttpException);
  });

  it('returns ok for the verification handshake (verification_token, no type)', async () => {
    const result = await controller.handleWebhook({} as any, undefined, {
      verification_token: 'secret_abc123',
    });
    expect(result).toEqual({ ok: true });
  });

  it('accepts valid HMAC signature', async () => {
    const body = { type: 'page.content_updated', page: { id: 'page-1' } };
    const rawBody = JSON.stringify(body);
    const sig = createHmac('sha256', verificationToken).update(rawBody).digest('hex');

    const result = await controller.handleWebhook({ rawBody } as any, sig, body);
    expect(result).toEqual({ ok: true });
  });

  it('rejects invalid HMAC signature', async () => {
    const body = { type: 'page.content_updated', page: { id: 'page-1' } };
    const rawBody = JSON.stringify(body);

    await expect(
      controller.handleWebhook({ rawBody } as any, 'invalid-sig', body),
    ).rejects.toThrow(HttpException);
  });
});
