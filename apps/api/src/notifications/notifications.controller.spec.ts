import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let service: Partial<NotificationsService>;

  beforeEach(async () => {
    service = {
      subscribe: jest.fn().mockResolvedValue(undefined),
      unsubscribe: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [{ provide: NotificationsService, useValue: service }],
    }).compile();

    controller = module.get<NotificationsController>(NotificationsController);
  });

  it('subscribes a push endpoint', async () => {
    const result = await controller.subscribe({
      endpoint: 'https://push.example.com/1',
      keys: { p256dh: 'key1', auth: 'key2' },
    });

    expect(service.subscribe).toHaveBeenCalledWith('https://push.example.com/1', 'key1', 'key2');
    expect(result).toEqual({ subscribed: true });
  });

  it('unsubscribes a push endpoint', async () => {
    await controller.unsubscribe({ endpoint: 'https://push.example.com/1' });
    expect(service.unsubscribe).toHaveBeenCalledWith('https://push.example.com/1');
  });
});
