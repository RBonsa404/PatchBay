import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost, rateLimited, systemPrompt } from '../../../functions/api/aicha.js';

const call = (body: unknown, env: Record<string, string> = { DEEPSEEK_API_KEY: 'secret-key' }, origin: string | null = 'https://patchbay.pages.dev', ip = String(Math.random())): Promise<Response> =>
  onRequestPost({
    env,
    request: new Request('https://patchbay.pages.dev/api/aicha', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip, ...(origin ? { Origin: origin } : {}) },
      body: JSON.stringify(body),
    }),
  });

const reply = (content: string, status = 200): void => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status })));
};

afterEach(() => vi.unstubAllGlobals());

describe('Aïcha online', () => {
  it('answers a network question, with the key sent only to DeepSeek', async () => {
    reply('OSPF est un protocole de routage.');
    const response = await call({ question: 'C’est quoi OSPF ?', mission: 'M1', objective: 'Câbler' });
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({ answer: 'OSPF est un protocole de routage.' });
    expect(body).not.toContain('secret-key');
    const [url, init] = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]!;
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret-key');
  });

  it('blocks what the model marks as off topic', async () => {
    reply('HORS_SUJET');
    expect(await (await call({ question: 'Quelle est la capitale du Mali ?' })).json()).toEqual({ blocked: true });
  });

  it('refuses other sites, empty questions and a missing key', async () => {
    reply('non');
    expect((await call({ question: 'x' }, undefined, 'https://autre-site.example')).status).toBe(403);
    expect((await call({ question: 'x' }, undefined, null)).status).toBe(403);
    expect((await call({ question: '   ' })).status).toBe(400);
    expect((await call({ question: 'x' }, {})).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('hides upstream failures, such as an empty balance', async () => {
    reply('Insufficient Balance for secret-key', 402);
    const response = await call({ question: 'x' });
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('secret-key');
  });

  it('caps the question and the history it forwards', async () => {
    reply('ok');
    await call({ question: 'a'.repeat(2000), history: Array.from({ length: 20 }, (_, i) => ({ role: 'system', content: `ligne ${i}` })) });
    const [, init] = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]!;
    const sent = JSON.parse(init.body as string) as { messages: { role: string; content: string }[]; max_tokens: number };
    expect(sent.messages).toHaveLength(6);
    expect(sent.messages.filter((m) => m.role === 'system')).toHaveLength(1);
    expect(sent.messages.at(-1)!.content).toHaveLength(400);
    expect(sent.max_tokens).toBeLessThanOrEqual(350);
  });

  it('limits one visitor, then forgets after the time window', () => {
    const start = 1_000_000;
    for (let i = 0; i < 15; i++) expect(rateLimited('v', start + i)).toBe(false);
    expect(rateLimited('v', start + 20)).toBe(true);
    expect(rateLimited('v', start + 6 * 60 * 1000)).toBe(false);
  });

  it('tells the model to refuse anything but networking', () => {
    expect(systemPrompt('M1', 'Câbler')).toContain('HORS_SUJET');
  });
});
