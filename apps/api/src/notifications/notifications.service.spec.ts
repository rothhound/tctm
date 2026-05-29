import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from './notifications.service';
import { DB } from '../db/db.module';

// Mock web-push module
jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn().mockResolvedValue({}),
}));

import * as webpush from 'web-push';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let mockDb: any;

  beforeEach(async () => {
    mockDb = {
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockReturnValue({
          onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
        }),
      }),
      delete: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      }),
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockResolvedValue([
          { id: 'sub-1', endpoint: 'https://push.example.com/1', keysP256dh: 'p256dh_key', keysAuth: 'auth_key' },
        ]),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: DB, useValue: mockDb },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, def?: string) => {
              if (key === 'VAPID_PUBLIC_KEY') return 'test-public-key';
              if (key === 'VAPID_PRIVATE_KEY') return 'test-private-key';
              if (key === 'VAPID_SUBJECT') return 'mailto:test@example.com';
              return def;
            },
          },
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    (webpush.sendNotification as jest.Mock).mockClear();
  });

  describe('subscribe', () => {
    it('inserts a push subscription', async () => {
      await service.subscribe('https://push.example.com/1', 'p256dh', 'auth');
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('unsubscribe', () => {
    it('deletes a push subscription by endpoint', async () => {
      await service.unsubscribe('https://push.example.com/1');
      expect(mockDb.delete).toHaveBeenCalled();
    });
  });

  describe('sendPush', () => {
    it('sends notification to all subscribers', async () => {
      await service.sendPush({ title: 'New task', body: 'Send cap table' });

      expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
      expect(webpush.sendNotification).toHaveBeenCalledWith(
        { endpoint: 'https://push.example.com/1', keys: { p256dh: 'p256dh_key', auth: 'auth_key' } },
        expect.any(String),
      );
    });

    it('removes expired subscriptions (410)', async () => {
      (webpush.sendNotification as jest.Mock).mockRejectedValue({ statusCode: 410 });

      await service.sendPush({ title: 'Test', body: 'Test' });

      expect(mockDb.delete).toHaveBeenCalled();
    });

    it('handles send errors gracefully', async () => {
      (webpush.sendNotification as jest.Mock).mockRejectedValue(new Error('Network error'));

      // Should not throw
      await service.sendPush({ title: 'Test', body: 'Test' });
    });
  });
});
