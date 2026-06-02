jest.mock('./gmail-auth', () => ({ resolveGmailClient: jest.fn() }));

import { resolveGmailClient } from './gmail-auth';
import { GmailWatchService } from './gmail-watch.service';

describe('GmailWatchService', () => {
  let service: GmailWatchService;
  let watchMock: jest.Mock;
  let processHistory: jest.Mock;
  let existing: any;
  let topic: string | undefined;
  let insertOnConflictSet: any;
  let updateSet: any;
  let insertCalled: boolean;
  let updateCalled: boolean;

  beforeEach(() => {
    (resolveGmailClient as jest.Mock).mockReset();

    topic = 'projects/p/topics/gmail-push';
    existing = undefined;
    insertOnConflictSet = undefined;
    updateSet = undefined;
    insertCalled = false;
    updateCalled = false;

    watchMock = jest.fn().mockResolvedValue({ data: { historyId: 'NEW123', expiration: '4102444800000' } });
    (resolveGmailClient as jest.Mock).mockReturnValue({
      client: { users: { watch: watchMock } },
      mode: 'delegation',
      subject: 'tctm@svangel.com',
    });
    processHistory = jest.fn().mockResolvedValue(undefined);

    const db: any = {
      select: () => ({ from: () => ({ where: () => Promise.resolve(existing ? [existing] : []) }) }),
      insert: () => ({
        values: () => ({
          onConflictDoUpdate: (arg: any) => {
            insertCalled = true;
            insertOnConflictSet = arg.set;
            return Promise.resolve();
          },
        }),
      }),
      update: () => ({
        set: (s: any) => {
          updateCalled = true;
          updateSet = s;
          return { where: () => Promise.resolve() };
        },
      }),
    };
    const config: any = { get: (k: string, def?: any) => (k === 'GMAIL_PUBSUB_TOPIC' ? topic : def) };
    const gmailService: any = { processHistoryNotification: processHistory };

    service = new GmailWatchService(db, config, gmailService);
  });

  it('skips when GMAIL_PUBSUB_TOPIC is not set', async () => {
    topic = undefined;
    await service.renewWatch();
    expect(resolveGmailClient).not.toHaveBeenCalled();
    expect(watchMock).not.toHaveBeenCalled();
  });

  it('skips when Gmail auth is not configured', async () => {
    (resolveGmailClient as jest.Mock).mockReturnValue(null);
    await service.renewWatch();
    expect(watchMock).not.toHaveBeenCalled();
    expect(processHistory).not.toHaveBeenCalled();
  });

  it('establishes the checkpoint on the first watch, with no catch-up', async () => {
    existing = undefined; // no prior state

    await service.renewWatch();

    expect(watchMock).toHaveBeenCalled();
    expect(insertCalled).toBe(true);
    expect(insertOnConflictSet.historyId).toBe('NEW123');
    expect(processHistory).not.toHaveBeenCalled();
  });

  it('preserves the checkpoint on renewal (does NOT overwrite historyId) and catches up', async () => {
    existing = { id: 'singleton', historyId: 'OLD99' };

    await service.renewWatch();

    expect(updateCalled).toBe(true);
    expect(updateSet).not.toHaveProperty('historyId'); // ← the bug fix: checkpoint preserved
    expect(updateSet).toHaveProperty('watchExpiresAt');
    expect(processHistory).toHaveBeenCalledWith('NEW123'); // catch up OLD99 → NEW123
    expect(insertCalled).toBe(false);
  });

  it('registers the watch on application bootstrap', async () => {
    const spy = jest.spyOn(service, 'renewWatch').mockResolvedValue(undefined);
    service.onApplicationBootstrap();
    expect(spy).toHaveBeenCalled();
  });
});
