import { AnthropicProvider } from './anthropic.provider';
import { MODELS } from '../anthropic.module';

describe('AnthropicProvider', () => {
  it('maps the messages response to text + usage + cost and applies cache_control when asked', async () => {
    const create = jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: '{"ok":true}' }],
      usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 400, cache_creation_input_tokens: 100 },
    });
    const provider = new AnthropicProvider({ messages: { create } } as any);

    const res = await provider.complete({ purpose: 'extract', system: 's', user: 'u', maxTokens: 100, cacheSystem: true });

    expect(res.text).toBe('{"ok":true}');
    expect(res.provider).toBe('anthropic');
    expect(res.model).toBe(MODELS.EXTRACTOR);
    expect(res.usage).toEqual({ inputTokens: 1000, outputTokens: 200, cacheReadTokens: 400, cacheCreationTokens: 100 });

    const args = create.mock.calls[0][0];
    expect(args.model).toBe(MODELS.EXTRACTOR);
    expect(args.system[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('omits cache_control when cacheSystem is not set', async () => {
    const create = jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'x' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const provider = new AnthropicProvider({ messages: { create } } as any);

    await provider.complete({ purpose: 'judge', system: 's', user: 'u', maxTokens: 10 });
    expect(create.mock.calls[0][0].system[0].cache_control).toBeUndefined();
  });

  it('throws a clear error when selected without an API key', async () => {
    const provider = new AnthropicProvider(null);
    expect(provider.available).toBe(false);
    await expect(
      provider.complete({ purpose: 'extract', system: 's', user: 'u', maxTokens: 10 }),
    ).rejects.toThrow('ANTHROPIC_API_KEY');
  });
});
