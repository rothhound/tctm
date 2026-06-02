import { OpenAiProvider } from './openai.provider';

function cfg(env: Record<string, string> = {}) {
  return { get: (k: string, def?: any) => env[k] ?? def } as any;
}

describe('OpenAiProvider', () => {
  it('maps the chat-completion response to text + usage + cost', async () => {
    const create = jest.fn().mockResolvedValue({
      choices: [{ message: { content: '{"ok":true}' } }],
      usage: { prompt_tokens: 1000, completion_tokens: 200, prompt_tokens_details: { cached_tokens: 400 } },
    });
    const provider = new OpenAiProvider({ chat: { completions: { create } } } as any, cfg());

    const res = await provider.complete({ purpose: 'extract', system: 's', user: 'u', maxTokens: 100 });

    expect(res.text).toBe('{"ok":true}');
    expect(res.provider).toBe('openai');
    expect(res.model).toBe('gpt-4o');
    expect(res.usage).toEqual({ inputTokens: 1000, outputTokens: 200, cacheReadTokens: 400, cacheCreationTokens: 0 });
    // gpt-4o: uncached 600 @ $2.5, cached 400 @ $1.25, output 200 @ $10, per 1M tokens
    expect(res.costUsd).toBeCloseTo((600 * 2.5 + 400 * 1.25 + 200 * 10) / 1_000_000, 12);

    const args = create.mock.calls[0][0];
    expect(args.model).toBe('gpt-4o');
    expect(args.max_completion_tokens).toBe(100);
    expect(args.messages[0]).toEqual({ role: 'system', content: 's' });
    expect(args.messages[1]).toEqual({ role: 'user', content: 'u' });
  });

  it('honors per-purpose model overrides from env', () => {
    const provider = new OpenAiProvider({} as any, cfg({ OPENAI_MODEL_JUDGE: 'gpt-4.1-mini' }));
    expect(provider.modelFor('judge')).toBe('gpt-4.1-mini');
    expect(provider.modelFor('extract')).toBe('gpt-4o'); // default
  });

  it('logs cost 0 for an unknown/overridden model', async () => {
    const create = jest.fn().mockResolvedValue({
      choices: [{ message: { content: 'x' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });
    const provider = new OpenAiProvider(
      { chat: { completions: { create } } } as any,
      cfg({ OPENAI_MODEL_EXTRACTOR: 'some-future-model' }),
    );

    const res = await provider.complete({ purpose: 'extract', system: 's', user: 'u', maxTokens: 10 });
    expect(res.model).toBe('some-future-model');
    expect(res.costUsd).toBe(0);
  });

  it('throws a clear error when selected without an API key', async () => {
    const provider = new OpenAiProvider(null, cfg());
    expect(provider.available).toBe(false);
    await expect(
      provider.complete({ purpose: 'extract', system: 's', user: 'u', maxTokens: 10 }),
    ).rejects.toThrow('OPENAI_API_KEY');
  });
});
