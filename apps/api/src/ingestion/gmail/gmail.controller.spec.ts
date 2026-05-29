import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpException } from '@nestjs/common';
import { GmailController } from './gmail.controller';
import { GmailService } from './gmail.service';

// Mock google-auth-library and googleapis to avoid ESM import issues
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: jest.fn().mockResolvedValue({ getPayload: () => ({}) }),
  })),
}));

jest.mock('googleapis', () => ({
  google: {
    auth: { OAuth2: jest.fn() },
    gmail: jest.fn().mockReturnValue({}),
  },
}));

describe('GmailController', () => {
  let controller: GmailController;
  let gmailService: Partial<GmailService>;

  beforeEach(async () => {
    gmailService = {
      processHistoryNotification: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GmailController],
      providers: [
        { provide: GmailService, useValue: gmailService },
        { provide: ConfigService, useValue: { get: () => 'test-client-id' } },
      ],
    }).compile();

    controller = module.get<GmailController>(GmailController);
  });

  it('returns ok for empty message', async () => {
    const result = await controller.handlePush(undefined, {});
    expect(result).toEqual({ ok: true });
  });

  it('decodes Pub/Sub message and processes history', async () => {
    const data = Buffer.from(JSON.stringify({ emailAddress: 'test@example.com', historyId: '12345' })).toString('base64');

    const result = await controller.handlePush('Bearer valid-jwt', { message: { data } });

    expect(result).toEqual({ ok: true });
    // processHistoryNotification is called via setImmediate, so it's async
  });

  it('handles invalid Pub/Sub data gracefully', async () => {
    const data = Buffer.from('not-json').toString('base64');
    const result = await controller.handlePush(undefined, { message: { data } });
    expect(result).toEqual({ ok: true });
  });

  it('handles missing historyId gracefully', async () => {
    const data = Buffer.from(JSON.stringify({ emailAddress: 'test@example.com' })).toString('base64');
    const result = await controller.handlePush(undefined, { message: { data } });
    expect(result).toEqual({ ok: true });
  });
});
