import { Test, TestingModule } from '@nestjs/testing';
import { BriefService } from './brief.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DB } from '../db/db.module';

describe('BriefService', () => {
  let service: BriefService;
  let mockNotifications: Partial<NotificationsService>;
  let mockDb: any;

  beforeEach(async () => {
    mockNotifications = { sendPush: jest.fn().mockResolvedValue(undefined) };
    mockDb = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            groupBy: jest.fn().mockResolvedValue([
              { bucket: 'today', count: 3 },
              { bucket: 'waiting_on', count: 2 },
              { bucket: 'inbox', count: 4 },
            ]),
          }),
        }),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BriefService,
        { provide: DB, useValue: mockDb },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get<BriefService>(BriefService);
  });

  it('composes a summary with correct counts', async () => {
    const summary = await service.composeSummary();
    expect(summary.today).toBe(3);
    expect(summary.waitingOn).toBe(2);
    expect(summary.inbox).toBe(4);
    expect(summary.message).toContain('3 must-do today');
    expect(summary.message).toContain('2 waiting on responses');
    expect(summary.message).toContain('4 new in inbox');
  });

  it('sends push notification with summary', async () => {
    await service.sendDailyBrief();
    expect(mockNotifications.sendPush).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Daily Brief' }),
    );
  });

  it('handles all-clear state', async () => {
    mockDb.select.mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          groupBy: jest.fn().mockResolvedValue([]),
        }),
      }),
    });

    const summary = await service.composeSummary();
    expect(summary.message).toContain('All clear');
  });
});
