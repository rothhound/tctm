import { LlmService } from './llm.service';
import { LlmProviderName } from './llm.types';

function fakeProvider(name: LlmProviderName): any {
  return {
    name,
    available: true,
    modelFor: jest.fn((p) => `${name}:${p}`),
    complete: jest.fn().mockResolvedValue({
      text: 'ok',
      provider: name,
      model: `${name}:m`,
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 },
      costUsd: 0,
    }),
  };
}

function cfg(env: Record<string, string>) {
  return { get: (k: string, def?: any) => env[k] ?? def } as any;
}

describe('LlmService', () => {
  it('defaults to anthropic', () => {
    const a = fakeProvider('anthropic');
    const o = fakeProvider('openai');
    const svc = new LlmService(cfg({}), a, o);

    expect(svc.providerName).toBe('anthropic');
    svc.modelFor('extract');
    expect(a.modelFor).toHaveBeenCalledWith('extract');
    expect(o.modelFor).not.toHaveBeenCalled();
  });

  it('selects openai when LLM_PROVIDER=openai and delegates complete()', async () => {
    const a = fakeProvider('anthropic');
    const o = fakeProvider('openai');
    const svc = new LlmService(cfg({ LLM_PROVIDER: 'openai' }), a, o);

    expect(svc.providerName).toBe('openai');
    await svc.complete({ purpose: 'extract', system: 's', user: 'u', maxTokens: 10 });
    expect(o.complete).toHaveBeenCalled();
    expect(a.complete).not.toHaveBeenCalled();
  });

  it('is case/whitespace-insensitive and falls back to anthropic on an unknown value', () => {
    const mk = (v: string) => new LlmService(cfg({ LLM_PROVIDER: v }), fakeProvider('anthropic'), fakeProvider('openai'));
    expect(mk('  OpenAI ').providerName).toBe('openai');
    expect(mk('bogus').providerName).toBe('anthropic');
  });
});
