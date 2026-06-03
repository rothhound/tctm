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
              { triage: 'keep', count: 4 },
              { triage: 'review', count: 2 },
              { triage: 'dismissed', count: 5 },
              { triage: null, count: 1 },
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
    expect(summary.active).toBe(7); // keep 4 + review 2 + manual 1
    expect(summary.filtered).toBe(5);
    expect(summary.message).toContain('7 tasks in your queue');
    expect(summary.message).toContain('5 filtered as noise');
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
