import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { GmailService } from './gmail.service';
import { EntitiesService } from '../../entities/entities.service';
import { DB } from '../../db/db.module';
import { QUEUES } from '../../shared/queues.module';
import { isAutoSender } from './auto-senders';

// ---------------------------------------------------------------------------
// Helpers: mock Gmail API client
// ---------------------------------------------------------------------------
function createMockGmail() {
  return {
    users: {
      history: { list: jest.fn() },
      messages: { get: jest.fn(), list: jest.fn() },
      getProfile: jest.fn(),
    },
  };
}

function base64url(str: string): string {
  return Buffer.from(str, 'utf-8').toString('base64url');
}

function makeMessageResponse(overrides: {
  id?: string;
  from?: string;
  subject?: string;
  labelIds?: string[];
  payload?: any;
  internalDate?: string;
  threadId?: string;
  snippet?: string;
}) {
  const {
    id = 'msg-1',
    from = 'Jane Doe <jane@example.com>',
    subject = 'Hello',
    labelIds = ['INBOX'],
    payload,
    internalDate = '1700000000000',
    threadId = 'thread-1',
    snippet = 'A snippet',
  } = overrides;

  const defaultPayload = payload ?? {
    mimeType: 'text/plain',
    headers: [
      { name: 'From', value: from },
      { name: 'Subject', value: subject },
    ],
    body: { data: base64url('Hello, this is a test email body.') },
  };

  // Ensure headers are at the top-level payload
  if (!defaultPayload.headers) {
    defaultPayload.headers = [
      { name: 'From', value: from },
      { name: 'Subject', value: subject },
    ];
  }

  return {
    data: {
      id,
      threadId,
      labelIds,
      snippet,
      internalDate,
      payload: defaultPayload,
    },
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
describe('GmailService', () => {
  let service: GmailService;
  let mockDb: any;
  let mockQueue: any;
  let mockEntities: any;
  let mockGmail: ReturnType<typeof createMockGmail>;
  let queryResults: any[];

  beforeEach(async () => {
    queryResults = [];

    mockDb = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockImplementation(() => Promise.resolve(queryResults.shift() ?? [])),
        }),
      }),
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockImplementation(() => Promise.resolve(queryResults.shift())),
        }),
      }),
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockReturnValue({
          onConflictDoNothing: jest.fn().mockReturnValue({
            returning: jest.fn().mockImplementation(() => Promise.resolve(queryResults.shift() ?? [])),
          }),
        }),
      }),
    };

    mockQueue = { add: jest.fn() };
    mockEntities = { resolveByEmail: jest.fn() };
    mockGmail = createMockGmail();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GmailService,
        { provide: DB, useValue: mockDb },
        { provide: getQueueToken(QUEUES.SIGNALS_EXTRACT), useValue: mockQueue },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback?: any) => {
              const map: Record<string, string> = {
                GOOGLE_CLIENT_ID: 'client-id',
                GOOGLE_CLIENT_SECRET: 'client-secret',
                GMAIL_REFRESH_TOKEN: 'refresh-token',
                GMAIL_IMPERSONATE_SUBJECT: 'tctm@svangel.com',
                GMAIL_PRIORITY_SENDERS: 'vip@external.com,@accel.com',
              };
              return map[key] ?? fallback ?? '';
            }),
          },
        },
        { provide: EntitiesService, useValue: mockEntities },
      ],
    }).compile();

    service = module.get<GmailService>(GmailService);

    // Inject mock gmail client directly so we bypass OAuth/getGmailClient for most tests
    (service as any).gmail = mockGmail;
  });

  // =========================================================================
  // cleanBody
  // =========================================================================
  describe('cleanBody', () => {
    it('strips quoted replies', () => {
      const body = 'Hello\n\n> On Monday, John wrote:\n> Something\n\nMy reply';
      expect(service.cleanBody(body)).toBe('Hello\n\n\nMy reply');
    });

    it('keeps the full forwarded body (quoted original is the payload)', () => {
      const body =
        '---------- Forwarded message ---------\n' +
        'From: Paulina <paulina@svangel.com>\n' +
        'Subject: Fwd: BioStack seed\n\n' +
        '> BioStack is raising a $4M seed. Can you take a look and let me know by Friday?\n' +
        '> Deck attached.';
      const cleaned = service.cleanBody(body);
      expect(cleaned).toContain('BioStack is raising a $4M seed');
      expect(cleaned).toContain('let me know by Friday');
    });

    it('strips email signatures after --', () => {
      const body = 'Main content\n--\nJohn Doe\nCEO, Acme Corp';
      expect(service.cleanBody(body)).toBe('Main content');
    });

    it('strips signatures after underscores', () => {
      const body = 'Main content\n_____\nJohn Doe';
      expect(service.cleanBody(body)).toBe('Main content');
    });

    it('strips "Sent from" lines', () => {
      const body = 'Quick reply\nSent from my iPhone';
      expect(service.cleanBody(body)).toBe('Quick reply');
    });

    it('strips "Sent from my iPad"', () => {
      const body = 'Quick reply\nSent from my iPad';
      expect(service.cleanBody(body)).toBe('Quick reply');
    });

    it('strips "Sent from my Android"', () => {
      const body = 'Quick reply\nSent from my Android';
      expect(service.cleanBody(body)).toBe('Quick reply');
    });

    it('truncates to 4000 chars', () => {
      const body = 'x'.repeat(5000);
      expect(service.cleanBody(body).length).toBe(4000);
    });

    it('preserves body shorter than 4000 chars', () => {
      const body = 'Short message';
      expect(service.cleanBody(body)).toBe('Short message');
    });

    it('handles empty body', () => {
      expect(service.cleanBody('')).toBe('');
    });

    it('handles body with only quoted replies', () => {
      const body = '> line 1\n> line 2\n> line 3';
      expect(service.cleanBody(body)).toBe('');
    });
  });

  // =========================================================================
  // parseForward
  // =========================================================================
  describe('parseForward', () => {
    it('detects a bare forward (no note) and keeps the forwarded body', () => {
      const body = '---------- Forwarded message ---------\nFrom: Paulina\n\n> Take a look by Friday';
      const r = service.parseForward(body);
      expect(r.isForward).toBe(true);
      expect(r.note).toBe('');
      expect(r.forwarded).toContain('Take a look by Friday');
    });

    it('splits the forwarder note from the forwarded email', () => {
      const body = 'Please review and reply.\n\n---------- Forwarded message ---------\nFrom: Andrea\nDeck attached';
      const r = service.parseForward(body);
      expect(r.isForward).toBe(true);
      expect(r.note).toBe('Please review and reply.');
      expect(r.forwarded).toContain('Deck attached');
    });

    it('detects an Outlook forward', () => {
      const body = 'FYI\n-----Original Message-----\nFrom: Bob\nCan you sign off?';
      const r = service.parseForward(body);
      expect(r.isForward).toBe(true);
      expect(r.note).toBe('FYI');
    });

    it('returns isForward=false for a normal email', () => {
      const r = service.parseForward('Hi, can you send the deck?');
      expect(r.isForward).toBe(false);
    });
  });

  // =========================================================================
  // processHistoryNotification
  // =========================================================================
  describe('processHistoryNotification', () => {
    it('skips when gmail client is null (no credentials)', async () => {
      // Set gmail to null so getGmailClient is called; also override it to return null
      (service as any).gmail = null;
      // Replace getGmailClient to return null
      jest.spyOn(service as any, 'getGmailClient').mockResolvedValue(null);

      await service.processHistoryNotification('12345');

      // No DB calls should happen
      expect(mockDb.select).not.toHaveBeenCalled();
    });

    it('skips when no stored historyId in DB', async () => {
      // DB returns empty array for select (no stored state)
      queryResults = [[]];

      await service.processHistoryNotification('12345');

      expect(mockDb.select).toHaveBeenCalled();
      // Should not call history.list
      expect(mockGmail.users.history.list).not.toHaveBeenCalled();
    });

    it('processes messages from history records', async () => {
      // DB returns stored historyId
      queryResults = [
        [{ id: 'singleton', historyId: '10000' }], // select stored state
        [{ id: 'signal-uuid-1' }],                  // insert signal → returned
        undefined,                                    // update gmailWatchState
      ];

      mockGmail.users.history.list.mockResolvedValue({
        data: {
          history: [
            {
              messagesAdded: [
                { message: { id: 'msg-abc' } },
              ],
            },
          ],
        },
      });

      mockGmail.users.messages.get.mockResolvedValue(
        makeMessageResponse({ id: 'msg-abc' }),
      );

      mockEntities.resolveByEmail.mockResolvedValue(null);

      await service.processHistoryNotification('10001');

      expect(mockGmail.users.history.list).toHaveBeenCalledWith({
        userId: 'me',
        startHistoryId: '10000',
        historyTypes: ['messageAdded'],
      });
      expect(mockGmail.users.messages.get).toHaveBeenCalledWith({
        userId: 'me',
        id: 'msg-abc',
        format: 'full',
      });
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockQueue.add).toHaveBeenCalledWith('extract', { signalId: 'signal-uuid-1' });
    });

    it('updates historyId after processing', async () => {
      queryResults = [
        [{ id: 'singleton', historyId: '10000' }], // select
        [{ id: 'signal-uuid-1' }],                  // insert
        undefined,                                    // update
      ];

      mockGmail.users.history.list.mockResolvedValue({
        data: { history: [{ messagesAdded: [{ message: { id: 'msg-1' } }] }] },
      });
      mockGmail.users.messages.get.mockResolvedValue(
        makeMessageResponse({ id: 'msg-1' }),
      );
      mockEntities.resolveByEmail.mockResolvedValue(null);

      await service.processHistoryNotification('20000');

      // Verify the update call was made with the new historyId
      expect(mockDb.update).toHaveBeenCalled();
      const setCall = mockDb.update().set;
      expect(setCall).toHaveBeenCalledWith(
        expect.objectContaining({ historyId: '20000' }),
      );
    });

    it('deduplicates message IDs across multiple history records', async () => {
      queryResults = [
        [{ id: 'singleton', historyId: '10000' }], // select
        [{ id: 'signal-uuid-1' }],                  // insert (only one because deduped)
        undefined,                                    // update
      ];

      mockGmail.users.history.list.mockResolvedValue({
        data: {
          history: [
            { messagesAdded: [{ message: { id: 'msg-dup' } }] },
            { messagesAdded: [{ message: { id: 'msg-dup' } }] }, // duplicate
          ],
        },
      });
      mockGmail.users.messages.get.mockResolvedValue(
        makeMessageResponse({ id: 'msg-dup' }),
      );
      mockEntities.resolveByEmail.mockResolvedValue(null);

      await service.processHistoryNotification('20000');

      // Should only process once due to Set dedup
      expect(mockGmail.users.messages.get).toHaveBeenCalledTimes(1);
    });

    it('handles empty history (no messagesAdded)', async () => {
      queryResults = [
        [{ id: 'singleton', historyId: '10000' }], // select
        undefined,                                    // update
      ];

      mockGmail.users.history.list.mockResolvedValue({
        data: { history: [] },
      });

      await service.processHistoryNotification('10001');

      expect(mockGmail.users.messages.get).not.toHaveBeenCalled();
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('handles null history array', async () => {
      queryResults = [
        [{ id: 'singleton', historyId: '10000' }],
        undefined, // update
      ];

      mockGmail.users.history.list.mockResolvedValue({
        data: { history: null },
      });

      await service.processHistoryNotification('10001');

      expect(mockGmail.users.messages.get).not.toHaveBeenCalled();
    });

    it('falls back to fullSync24h on 404 error', async () => {
      queryResults = [
        [{ id: 'singleton', historyId: '10000' }], // select for processHistoryNotification
        // fullSync24h will also use queryResults; set those up
        undefined, // update in fullSync24h
      ];

      const error404: any = new Error('Not Found');
      error404.code = 404;
      mockGmail.users.history.list.mockRejectedValue(error404);

      // fullSync24h: messages.list returns empty, getProfile returns historyId
      mockGmail.users.messages.list.mockResolvedValue({
        data: { messages: [] },
      });
      mockGmail.users.getProfile.mockResolvedValue({
        data: { historyId: '99999' },
      });

      await service.processHistoryNotification('10001');

      expect(mockGmail.users.messages.list).toHaveBeenCalled();
      expect(mockGmail.users.getProfile).toHaveBeenCalledWith({ userId: 'me' });
    });

    it('rethrows non-404 errors', async () => {
      queryResults = [
        [{ id: 'singleton', historyId: '10000' }],
      ];

      const error500: any = new Error('Internal Server Error');
      error500.code = 500;
      mockGmail.users.history.list.mockRejectedValue(error500);

      await expect(service.processHistoryNotification('10001')).rejects.toThrow(
        'Internal Server Error',
      );
    });
  });

  // =========================================================================
  // processMessage (tested via processHistoryNotification)
  // =========================================================================
  describe('processMessage (via processHistoryNotification)', () => {
    function setupHistoryWithMessage(msgResponse: any) {
      queryResults = [
        [{ id: 'singleton', historyId: '10000' }], // select state
      ];

      mockGmail.users.history.list.mockResolvedValue({
        data: {
          history: [{ messagesAdded: [{ message: { id: 'msg-1' } }] }],
        },
      });
      mockGmail.users.messages.get.mockResolvedValue(msgResponse);
    }

    it('extracts email and name from "Name <email>" format', async () => {
      setupHistoryWithMessage(
        makeMessageResponse({ from: 'Alice Smith <alice@startup.com>' }),
      );
      queryResults.push([{ id: 'sig-1' }]); // insert returns
      queryResults.push(undefined);           // update state

      mockEntities.resolveByEmail.mockResolvedValue(null);

      await service.processHistoryNotification('10001');

      // Check the signal inserted has correct author
      const insertCall = mockDb.insert().values;
      expect(insertCall).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            author: { name: 'Alice Smith', email: 'alice@startup.com' },
          }),
        }),
      );
    });

    it('extracts plain email (no angle brackets)', async () => {
      setupHistoryWithMessage(
        makeMessageResponse({ from: 'bob@company.com' }),
      );
      queryResults.push([{ id: 'sig-1' }]);
      queryResults.push(undefined);

      mockEntities.resolveByEmail.mockResolvedValue(null);

      await service.processHistoryNotification('10001');

      const insertCall = mockDb.insert().values;
      expect(insertCall).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            author: { name: '', email: 'bob@company.com' },
          }),
        }),
      );
    });

    it('skips DRAFT label messages', async () => {
      setupHistoryWithMessage(
        makeMessageResponse({ labelIds: ['DRAFT'] }),
      );
      queryResults.push(undefined); // update state

      await service.processHistoryNotification('10001');

      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('skips SENT label messages', async () => {
      setupHistoryWithMessage(
        makeMessageResponse({ labelIds: ['SENT'] }),
      );
      queryResults.push(undefined);

      await service.processHistoryNotification('10001');

      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('skips TRASH label messages', async () => {
      setupHistoryWithMessage(
        makeMessageResponse({ labelIds: ['TRASH'] }),
      );
      queryResults.push(undefined);

      await service.processHistoryNotification('10001');

      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('skips auto-sender emails', async () => {
      setupHistoryWithMessage(
        makeMessageResponse({ from: 'noreply@service.com' }),
      );
      queryResults.push(undefined); // update state

      await service.processHistoryNotification('10001');

      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('skips messages with empty body', async () => {
      setupHistoryWithMessage(
        makeMessageResponse({
          payload: {
            mimeType: 'text/plain',
            headers: [
              { name: 'From', value: 'person@example.com' },
              { name: 'Subject', value: 'Empty' },
            ],
            body: { data: base64url('   ') }, // whitespace-only body
          },
        }),
      );
      queryResults.push(undefined); // update state

      await service.processHistoryNotification('10001');

      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('sets subSource to gmail_dropbox for a direct (non-forward) email — the whole mailbox is a dropbox', async () => {
      setupHistoryWithMessage(
        makeMessageResponse({ from: 'partner@fund.com' }),
      );
      queryResults.push([{ id: 'sig-1' }]);
      queryResults.push(undefined);

      await service.processHistoryNotification('10001');

      const insertCall = mockDb.insert().values;
      expect(insertCall).toHaveBeenCalledWith(
        expect.objectContaining({ subSource: 'gmail_dropbox' }),
      );
    });

    it('sets subSource to gmail_dropbox regardless of sender', async () => {
      setupHistoryWithMessage(
        makeMessageResponse({ from: 'stranger@random.com' }),
      );
      queryResults.push([{ id: 'sig-1' }]);
      queryResults.push(undefined);

      await service.processHistoryNotification('10001');

      const insertCall = mockDb.insert().values;
      expect(insertCall).toHaveBeenCalledWith(
        expect.objectContaining({ subSource: 'gmail_dropbox' }),
      );
    });

    it('sets subSource to gmail_priority for the firm domain (svangel.com)', async () => {
      setupHistoryWithMessage(
        makeMessageResponse({ from: 'Topher <topher@svangel.com>' }),
      );
      queryResults.push([{ id: 'sig-1' }]);
      queryResults.push(undefined);

      await service.processHistoryNotification('10001');

      const insertCall = mockDb.insert().values;
      expect(insertCall).toHaveBeenCalledWith(
        expect.objectContaining({ subSource: 'gmail_priority' }),
      );
    });

    it('sets subSource to gmail_priority for a configured priority sender / domain', async () => {
      setupHistoryWithMessage(
        makeMessageResponse({ from: 'Dana <dana@accel.com>' }), // @accel.com is in GMAIL_PRIORITY_SENDERS
      );
      queryResults.push([{ id: 'sig-1' }]);
      queryResults.push(undefined);

      await service.processHistoryNotification('10001');

      const insertCall = mockDb.insert().values;
      expect(insertCall).toHaveBeenCalledWith(
        expect.objectContaining({ subSource: 'gmail_priority' }),
      );
    });

    it('inserts signal with correct fields and dedup key', async () => {
      // Note: externalId and dedupKey use the messageId from history (msg-1),
      // not from the message response's data.id
      setupHistoryWithMessage(
        makeMessageResponse({
          id: 'msg-1',
          from: 'Founder <founder@startup.io>',
          subject: 'Series A update',
          threadId: 'thread-99',
          internalDate: '1700000000000',
        }),
      );
      queryResults.push([{ id: 'sig-inserted' }]);
      queryResults.push(undefined);

      mockEntities.resolveByEmail.mockResolvedValue(null);

      await service.processHistoryNotification('10001');

      const insertCall = mockDb.insert().values;
      expect(insertCall).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'gmail',
          subSource: 'gmail_dropbox',
          externalId: 'msg-1',
          dedupKey: 'gmail:msg-1',
          status: 'pending',
          payload: expect.objectContaining({
            title: 'Series A update',
            author: { name: 'Founder', email: 'founder@startup.io' },
            url: 'https://mail.google.com/mail/u/0/#inbox/msg-1',
            threadId: 'thread-99',
          }),
        }),
      );
    });

    it('uses "No subject" when subject header is missing', async () => {
      setupHistoryWithMessage({
        data: {
          id: 'msg-no-subj',
          threadId: 'thread-1',
          labelIds: ['INBOX'],
          snippet: '',
          internalDate: '1700000000000',
          payload: {
            mimeType: 'text/plain',
            headers: [
              { name: 'From', value: 'person@example.com' },
              // no Subject header
            ],
            body: { data: base64url('Some body text') },
          },
        },
      });
      queryResults.push([{ id: 'sig-1' }]);
      queryResults.push(undefined);

      mockEntities.resolveByEmail.mockResolvedValue(null);

      await service.processHistoryNotification('10001');

      const insertCall = mockDb.insert().values;
      expect(insertCall).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ title: 'No subject' }),
        }),
      );
    });

    it('queues extraction when signal is inserted (inserted.length > 0)', async () => {
      setupHistoryWithMessage(
        makeMessageResponse({ id: 'msg-queue-test' }),
      );
      queryResults.push([{ id: 'sig-queued' }]); // insert returns 1 row
      queryResults.push(undefined);

      mockEntities.resolveByEmail.mockResolvedValue(null);

      await service.processHistoryNotification('10001');

      expect(mockQueue.add).toHaveBeenCalledWith('extract', { signalId: 'sig-queued' });
    });

    it('does not queue when signal already exists (conflict, inserted.length === 0)', async () => {
      setupHistoryWithMessage(
        makeMessageResponse({ id: 'msg-dup-test' }),
      );
      queryResults.push([]); // insert returns empty (conflict, no-op)
      queryResults.push(undefined);

      mockEntities.resolveByEmail.mockResolvedValue(null);

      await service.processHistoryNotification('10001');

      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // extractBody (tested via processHistoryNotification)
  // =========================================================================
  describe('extractBody (via processHistoryNotification)', () => {
    function setupWithPayload(payload: any) {
      // Ensure headers are in the payload for processMessage to find From/Subject
      if (!payload.headers) {
        payload.headers = [
          { name: 'From', value: 'sender@example.com' },
          { name: 'Subject', value: 'Test' },
        ];
      }

      queryResults = [
        [{ id: 'singleton', historyId: '10000' }],
        [{ id: 'sig-1' }],
        undefined,
      ];

      mockGmail.users.history.list.mockResolvedValue({
        data: {
          history: [{ messagesAdded: [{ message: { id: 'msg-body' } }] }],
        },
      });
      mockGmail.users.messages.get.mockResolvedValue({
        data: {
          id: 'msg-body',
          threadId: 'thread-1',
          labelIds: ['INBOX'],
          snippet: '',
          internalDate: '1700000000000',
          payload,
        },
      });
      mockEntities.resolveByEmail.mockResolvedValue(null);
    }

    it('extracts text/plain from simple payload', async () => {
      const bodyText = 'Plain text email body';
      setupWithPayload({
        mimeType: 'text/plain',
        headers: [
          { name: 'From', value: 'sender@example.com' },
          { name: 'Subject', value: 'Test' },
        ],
        body: { data: base64url(bodyText) },
      });

      await service.processHistoryNotification('10001');

      const insertCall = mockDb.insert().values;
      expect(insertCall).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            body: bodyText,
          }),
        }),
      );
    });

    it('extracts text/plain from multipart payload', async () => {
      const bodyText = 'Plain from multipart';
      setupWithPayload({
        mimeType: 'multipart/alternative',
        headers: [
          { name: 'From', value: 'sender@example.com' },
          { name: 'Subject', value: 'Test' },
        ],
        parts: [
          {
            mimeType: 'text/plain',
            body: { data: base64url(bodyText) },
          },
          {
            mimeType: 'text/html',
            body: { data: base64url('<p>HTML version</p>') },
          },
        ],
      });

      await service.processHistoryNotification('10001');

      const insertCall = mockDb.insert().values;
      expect(insertCall).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            body: bodyText,
          }),
        }),
      );
    });

    it('falls back to text/html (stripped) when no text/plain', async () => {
      setupWithPayload({
        mimeType: 'multipart/alternative',
        headers: [
          { name: 'From', value: 'sender@example.com' },
          { name: 'Subject', value: 'Test' },
        ],
        parts: [
          {
            mimeType: 'text/html',
            body: { data: base64url('<p>HTML only body</p>') },
          },
        ],
      });

      await service.processHistoryNotification('10001');

      const insertCall = mockDb.insert().values;
      expect(insertCall).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            body: 'HTML only body',
          }),
        }),
      );
    });

    it('recurses into nested parts', async () => {
      const bodyText = 'Deeply nested text';
      setupWithPayload({
        mimeType: 'multipart/mixed',
        headers: [
          { name: 'From', value: 'sender@example.com' },
          { name: 'Subject', value: 'Test' },
        ],
        parts: [
          {
            mimeType: 'multipart/alternative',
            parts: [
              {
                mimeType: 'text/plain',
                body: { data: base64url(bodyText) },
              },
            ],
          },
        ],
      });

      await service.processHistoryNotification('10001');

      const insertCall = mockDb.insert().values;
      expect(insertCall).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            body: bodyText,
          }),
        }),
      );
    });

    it('returns empty string for null/undefined payload (skips message)', async () => {
      queryResults = [
        [{ id: 'singleton', historyId: '10000' }],
        undefined, // update
      ];

      mockGmail.users.history.list.mockResolvedValue({
        data: {
          history: [{ messagesAdded: [{ message: { id: 'msg-null' } }] }],
        },
      });
      mockGmail.users.messages.get.mockResolvedValue({
        data: {
          id: 'msg-null',
          threadId: 'thread-1',
          labelIds: ['INBOX'],
          snippet: '',
          internalDate: '1700000000000',
          payload: undefined,
        },
      });

      await service.processHistoryNotification('10001');

      // Should not insert because extractBody returns '' → body.trim() is falsy
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('returns empty string for payload with no body data and no parts', async () => {
      queryResults = [
        [{ id: 'singleton', historyId: '10000' }],
        undefined,
      ];

      mockGmail.users.history.list.mockResolvedValue({
        data: {
          history: [{ messagesAdded: [{ message: { id: 'msg-empty' } }] }],
        },
      });
      mockGmail.users.messages.get.mockResolvedValue({
        data: {
          id: 'msg-empty',
          threadId: 'thread-1',
          labelIds: ['INBOX'],
          snippet: '',
          internalDate: '1700000000000',
          payload: {
            mimeType: 'application/octet-stream',
            headers: [
              { name: 'From', value: 'sender@example.com' },
              { name: 'Subject', value: 'Attachment only' },
            ],
          },
        },
      });

      await service.processHistoryNotification('10001');

      expect(mockDb.insert).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // stripHtml (tested via extractBody → processHistoryNotification)
  // =========================================================================
  describe('stripHtml (via extractBody)', () => {
    // Access private method directly for more targeted testing
    function callStripHtml(html: string): string {
      return (service as any).stripHtml(html);
    }

    it('strips HTML tags', () => {
      expect(callStripHtml('<p>Hello <b>world</b></p>')).toBe('Hello world');
    });

    it('converts <br> to newlines', () => {
      expect(callStripHtml('line1<br>line2')).toBe('line1\nline2');
    });

    it('converts <br/> and <br /> to newlines', () => {
      expect(callStripHtml('a<br/>b<br />c')).toBe('a\nb\nc');
    });

    it('converts </p> to double newlines', () => {
      expect(callStripHtml('<p>para1</p><p>para2</p>')).toBe('para1\n\npara2');
    });

    it('strips script tags and their content', () => {
      expect(callStripHtml('text<script>alert("hi")</script>more')).toBe('textmore');
    });

    it('strips style tags and their content', () => {
      expect(callStripHtml('text<style>.foo{color:red}</style>more')).toBe('textmore');
    });

    it('decodes &nbsp; to space', () => {
      expect(callStripHtml('hello&nbsp;world')).toBe('hello world');
    });

    it('decodes &amp; to &', () => {
      expect(callStripHtml('A&amp;B')).toBe('A&B');
    });

    it('decodes &lt; and &gt;', () => {
      expect(callStripHtml('&lt;tag&gt;')).toBe('<tag>');
    });

    it('decodes &quot;', () => {
      expect(callStripHtml('&quot;quoted&quot;')).toBe('"quoted"');
    });

    it('collapses excessive newlines to double newlines', () => {
      expect(callStripHtml('a\n\n\n\n\nb')).toBe('a\n\nb');
    });
  });

  // =========================================================================
  // fullSync24h (tested via processHistoryNotification 404 fallback)
  // =========================================================================
  describe('fullSync24h (via 404 fallback)', () => {
    it('processes messages from the last 24h', async () => {
      queryResults = [
        [{ id: 'singleton', historyId: '10000' }], // select state
        // fullSync24h:
        [{ id: 'sig-full-1' }],                     // insert for msg-full-1
        undefined,                                    // update state
      ];

      const error404: any = new Error('Not Found');
      error404.code = 404;
      mockGmail.users.history.list.mockRejectedValue(error404);

      mockGmail.users.messages.list.mockResolvedValue({
        data: {
          messages: [{ id: 'msg-full-1' }],
        },
      });
      mockGmail.users.messages.get.mockResolvedValue(
        makeMessageResponse({ id: 'msg-full-1' }),
      );
      mockGmail.users.getProfile.mockResolvedValue({
        data: { historyId: '55555' },
      });
      mockEntities.resolveByEmail.mockResolvedValue(null);

      await service.processHistoryNotification('10001');

      expect(mockGmail.users.messages.list).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'me',
          maxResults: 100,
        }),
      );
      expect(mockGmail.users.messages.get).toHaveBeenCalledWith({
        userId: 'me',
        id: 'msg-full-1',
        format: 'full',
      });
    });

    it('updates historyId from profile after full sync', async () => {
      queryResults = [
        [{ id: 'singleton', historyId: '10000' }],
        undefined, // update
      ];

      const error404: any = new Error('Not Found');
      error404.code = 404;
      mockGmail.users.history.list.mockRejectedValue(error404);

      mockGmail.users.messages.list.mockResolvedValue({
        data: { messages: [] },
      });
      mockGmail.users.getProfile.mockResolvedValue({
        data: { historyId: '77777' },
      });

      await service.processHistoryNotification('10001');

      expect(mockGmail.users.getProfile).toHaveBeenCalledWith({ userId: 'me' });
      expect(mockDb.update).toHaveBeenCalled();
      const setCall = mockDb.update().set;
      expect(setCall).toHaveBeenCalledWith(
        expect.objectContaining({ historyId: '77777' }),
      );
    });

    it('handles null messages list in full sync', async () => {
      queryResults = [
        [{ id: 'singleton', historyId: '10000' }],
        undefined,
      ];

      const error404: any = new Error('Not Found');
      error404.code = 404;
      mockGmail.users.history.list.mockRejectedValue(error404);

      mockGmail.users.messages.list.mockResolvedValue({
        data: { messages: null },
      });
      mockGmail.users.getProfile.mockResolvedValue({
        data: { historyId: '88888' },
      });

      await service.processHistoryNotification('10001');

      expect(mockGmail.users.messages.get).not.toHaveBeenCalled();
    });

    it('skips profile historyId update when profile has no historyId', async () => {
      queryResults = [
        [{ id: 'singleton', historyId: '10000' }],
      ];

      const error404: any = new Error('Not Found');
      error404.code = 404;
      mockGmail.users.history.list.mockRejectedValue(error404);

      mockGmail.users.messages.list.mockResolvedValue({
        data: { messages: [] },
      });
      mockGmail.users.getProfile.mockResolvedValue({
        data: { historyId: undefined },
      });

      await service.processHistoryNotification('10001');

      // update should not be called because no historyId from profile
      expect(mockDb.update).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // getGmailClient
  // =========================================================================
  describe('getGmailClient', () => {
    it('returns cached client when already set', async () => {
      // gmail is already set in beforeEach, so calling getGmailClient should return it
      const result = await (service as any).getGmailClient();
      expect(result).toBe(mockGmail);
    });

    it('returns null when GOOGLE_CLIENT_ID is missing', async () => {
      (service as any).gmail = null;
      const configGet = jest.fn((key: string) => {
        if (key === 'GOOGLE_CLIENT_ID') return undefined;
        if (key === 'GOOGLE_CLIENT_SECRET') return 'secret';
        return '';
      });
      (service as any).config = { get: configGet };

      const result = await (service as any).getGmailClient();
      expect(result).toBeNull();
    });

    it('returns null when GOOGLE_CLIENT_SECRET is missing', async () => {
      (service as any).gmail = null;
      const configGet = jest.fn((key: string) => {
        if (key === 'GOOGLE_CLIENT_ID') return 'client-id';
        if (key === 'GOOGLE_CLIENT_SECRET') return undefined;
        return '';
      });
      (service as any).config = { get: configGet };

      const result = await (service as any).getGmailClient();
      expect(result).toBeNull();
    });

    it('returns null when GMAIL_REFRESH_TOKEN is missing', async () => {
      (service as any).gmail = null;
      const configGet = jest.fn((key: string) => {
        if (key === 'GOOGLE_CLIENT_ID') return 'client-id';
        if (key === 'GOOGLE_CLIENT_SECRET') return 'client-secret';
        if (key === 'GMAIL_REFRESH_TOKEN') return undefined;
        return '';
      });
      (service as any).config = { get: configGet };

      const result = await (service as any).getGmailClient();
      expect(result).toBeNull();
    });

    it('creates and caches Gmail client when credentials exist', async () => {
      (service as any).gmail = null;
      const configGet = jest.fn((key: string) => {
        if (key === 'GOOGLE_CLIENT_ID') return 'real-client-id';
        if (key === 'GOOGLE_CLIENT_SECRET') return 'real-client-secret';
        if (key === 'GMAIL_REFRESH_TOKEN') return 'real-refresh-token';
        return '';
      });
      (service as any).config = { get: configGet };

      const result = await (service as any).getGmailClient();
      expect(result).not.toBeNull();
      expect(result).toBeDefined();
      // Should be cached now
      expect((service as any).gmail).toBe(result);

      // Calling again returns the same cached instance
      const result2 = await (service as any).getGmailClient();
      expect(result2).toBe(result);
    });
  });
});

// ---------------------------------------------------------------------------
// isAutoSender (standalone, not part of GmailService)
// ---------------------------------------------------------------------------
describe('isAutoSender', () => {
  it('detects noreply addresses', () => {
    expect(isAutoSender('noreply@company.com')).toBe(true);
    expect(isAutoSender('no-reply@example.com')).toBe(true);
    expect(isAutoSender('do-not-reply@test.com')).toBe(true);
  });

  it('detects notification addresses', () => {
    expect(isAutoSender('notifications@github.com')).toBe(true);
    expect(isAutoSender('alerts@monitoring.io')).toBe(true);
  });

  it('detects newsletter platforms', () => {
    expect(isAutoSender('hello@news.substack.com')).toBe(true);
    expect(isAutoSender('send@mg.mailchimp.com')).toBe(true);
  });

  it('detects SaaS notifications', () => {
    expect(isAutoSender('notify@mail.notion.so')).toBe(true);
    expect(isAutoSender('updates@linear.app')).toBe(true);
  });

  it('passes through real emails', () => {
    expect(isAutoSender('roelof@sequoiacap.com')).toBe(false);
    expect(isAutoSender('founder@acme.io')).toBe(false);
    expect(isAutoSender('john.doe@company.com')).toBe(false);
  });

  it('detects calendar notifications', () => {
    expect(isAutoSender('calendar-notification@google.com')).toBe(true);
  });
});
