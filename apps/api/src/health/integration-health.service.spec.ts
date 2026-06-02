import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { IntegrationHealthService } from './integration-health.service';

// Mock the Slack SDK — auth.test resolves OK by default
const authTest = jest.fn().mockResolvedValue({ ok: true, user: 'assistant-bot', team: 'Acme' });
jest.mock('@slack/web-api', () => ({
  WebClient: jest.fn().mockImplementation(() => ({ auth: { test: authTest } })),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch as any;

function buildService(env: Record<string, string | undefined>): Promise<IntegrationHealthService> {
  return Test.createTestingModule({
    providers: [
      IntegrationHealthService,
      { provide: ConfigService, useValue: { get: (k: string, def?: any) => env[k] ?? def } },
    ],
  })
    .compile()
    .then((m) => m.get(IntegrationHealthService));
}

function byName(results: any[], name: string) {
  return results.find((r) => r.name === name);
}

describe('IntegrationHealthService', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    authTest.mockClear();
  });

  it('reports ok/configured states when everything is set and live checks pass', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    const svc = await buildService({
      ANTHROPIC_API_KEY: 'sk-ant-x',
      SLACK_BOT_TOKEN: 'xoxb-x',
      NOTION_VERIFICATION_TOKEN: 'ntok',
      PARTNER_NOTION_USER_ID: 'u-1',
      GOOGLE_CLIENT_ID: 'gcid',
      GMAIL_REFRESH_TOKEN: 'rt',
      GRANOLA_API_KEY: 'grn_x',
    });

    const results = await svc.checkAll();

    expect(byName(results, 'Anthropic').state).toBe('configured');
    expect(byName(results, 'Slack').state).toBe('ok');
    expect(byName(results, 'Slack').detail).toContain('Acme');
    expect(byName(results, 'Notion').state).toBe('configured');
    expect(byName(results, 'Gmail').state).toBe('configured'); // client + refresh token set
    expect(byName(results, 'Granola').state).toBe('ok');
  });

  it('reports not_configured when keys are absent', async () => {
    const svc = await buildService({});
    const results = await svc.checkAll();

    expect(byName(results, 'Anthropic').state).toBe('not_configured');
    expect(byName(results, 'Slack').state).toBe('not_configured');
    expect(byName(results, 'Notion').state).toBe('not_configured');
    expect(byName(results, 'Gmail').state).toBe('not_configured');
    expect(byName(results, 'Granola').state).toBe('not_configured');
    expect(mockFetch).not.toHaveBeenCalled(); // no live check without a key
  });

  it('flags Granola error on a non-2xx (e.g. wrong base URL → 404)', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' });
    const svc = await buildService({ GRANOLA_API_KEY: 'grn_x' });
    const results = await svc.checkAll();

    const granola = byName(results, 'Granola');
    expect(granola.state).toBe('error');
    expect(granola.detail).toContain('404');
  });

  it('flags Slack error when auth.test rejects (bad token)', async () => {
    authTest.mockRejectedValueOnce({ data: { error: 'invalid_auth' } });
    const svc = await buildService({ SLACK_BOT_TOKEN: 'xoxb-bad' });
    const results = await svc.checkAll();

    const slack = byName(results, 'Slack');
    expect(slack.state).toBe('error');
    expect(slack.detail).toContain('invalid_auth');
  });

  it('marks Gmail inactive when the refresh token is missing', async () => {
    const svc = await buildService({ GOOGLE_CLIENT_ID: 'gcid' });
    const results = await svc.checkAll();
    expect(byName(results, 'Gmail').state).toBe('inactive');
  });

  it('reports Gmail configured via domain-wide delegation', async () => {
    const svc = await buildService({ GMAIL_SERVICE_ACCOUNT_KEY: '{...}', GMAIL_IMPERSONATE_SUBJECT: 'tasks@firm.com' });
    const gmail = byName(await svc.checkAll(), 'Gmail');
    expect(gmail.state).toBe('configured');
    expect(gmail.detail).toContain('delegation');
  });

  it('marks Notion inactive when the partner user id is missing', async () => {
    const svc = await buildService({ NOTION_VERIFICATION_TOKEN: 'ntok' });
    const results = await svc.checkAll();
    expect(byName(results, 'Notion').state).toBe('inactive');
  });

  it('marks the active LLM provider ACTIVE and the other swap-ready', async () => {
    const svc = await buildService({
      LLM_PROVIDER: 'openai',
      ANTHROPIC_API_KEY: 'sk-ant-x',
      OPENAI_API_KEY: 'sk-proj-x',
    });
    const results = await svc.checkAll();

    expect(byName(results, 'OpenAI').state).toBe('configured');
    expect(byName(results, 'OpenAI').detail).toContain('ACTIVE');
    expect(byName(results, 'Anthropic').state).toBe('configured');
    expect(byName(results, 'Anthropic').detail).toContain('swap-ready');
  });

  it('defaults the active LLM provider to anthropic', async () => {
    const svc = await buildService({ ANTHROPIC_API_KEY: 'sk-ant-x' });
    const results = await svc.checkAll();

    expect(byName(results, 'Anthropic').detail).toContain('ACTIVE');
    expect(byName(results, 'OpenAI').state).toBe('not_configured');
  });
});
