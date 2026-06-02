import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpException } from '@nestjs/common';
import { GmailController } from './gmail.controller';
import { GmailService } from './gmail.service';

// Controllable OIDC verifier so we can test accept + reject paths.
const mockVerifyIdToken = jest.fn();
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({ verifyIdToken: mockVerifyIdToken })),
}));
jest.mock('googleapis', () => ({
  google: { auth: { OAuth2: jest.fn() }, gmail: jest.fn().mockReturnValue({}) },
}));

const dataFor = (obj: any) => Buffer.from(JSON.stringify(obj)).toString('base64');

describe('GmailController', () => {
  let controller: GmailController;
  let gmailService: Partial<GmailService>;

  beforeEach(async () => {
    mockVerifyIdToken.mockReset().mockResolvedValue({ getPayload: () => ({}) });
    gmailService = { processHistoryNotification: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GmailController],
      providers: [
        { provide: GmailService, useValue: gmailService },
        { provide: ConfigService, useValue: { get: () => 'test-client-id' } },
      ],
    }).compile();

    controller = module.get<GmailController>(GmailController);
  });

  it('rejects a push with no Authorization header (fail-closed)', async () => {
    await expect(
      controller.handlePush(undefined, { message: { data: dataFor({ historyId: '1' }) } }),
    ).rejects.toThrow(HttpException);
    expect(gmailService.processHistoryNotification).not.toHaveBeenCalled();
  });

  it('rejects a push whose OIDC JWT fails verification', async () => {
    mockVerifyIdToken.mockRejectedValueOnce(new Error('invalid token'));
    await expect(
      controller.handlePush('Bearer bad', { message: { data: dataFor({ historyId: '1' }) } }),
    ).rejects.toThrow(HttpException);
  });

  it('accepts and processes an authenticated push', async () => {
    const result = await controller.handlePush('Bearer valid-jwt', {
      message: { data: dataFor({ emailAddress: 'test@example.com', historyId: '12345' }) },
    });
    expect(result).toEqual({ ok: true });
  });

  it('returns ok for an authenticated empty (verification ping) message', async () => {
    const result = await controller.handlePush('Bearer valid-jwt', {});
    expect(result).toEqual({ ok: true });
  });

  it('handles invalid Pub/Sub data gracefully (authenticated)', async () => {
    const data = Buffer.from('not-json').toString('base64');
    const result = await controller.handlePush('Bearer valid-jwt', { message: { data } });
    expect(result).toEqual({ ok: true });
  });

  it('handles missing historyId gracefully (authenticated)', async () => {
    const result = await controller.handlePush('Bearer valid-jwt', {
      message: { data: dataFor({ emailAddress: 'test@example.com' }) },
    });
    expect(result).toEqual({ ok: true });
  });
});
