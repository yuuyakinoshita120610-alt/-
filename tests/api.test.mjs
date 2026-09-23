import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import OpenAI from 'openai';
import { analysisSchema, recipeInputSchema, recipesSchema, MAX_IMAGE_BYTES } from '../lib/contracts.ts';
import { getConfig } from '../lib/server/config.ts';
import { readImage, readIngredients, readLimited } from '../lib/server/input.ts';
import { acquire, clientKey } from '../lib/server/limiter.ts';
import { generate, mapError } from '../lib/server/ai.ts';
import { handle } from '../lib/server/handler.ts';
import { postApi } from '../lib/client-api.ts';

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
const config = { apiKey: 'test-key-not-real', redisUrl: 'https://redis.example.invalid', redisToken: 'test-redis', salt: 'a'.repeat(32), namespace: 'test', dailyLimit: 100, minuteLimit: 5, concurrency: 3 };
const recipe = { name: '野菜炒め', time: '15分', ingredients: ['キャベツ 100g'], steps: ['炒める'] };
const validRecipes = { recipes: [recipe, recipe, recipe] };
let calls;
let aiPayload;
let aiReply;
let redisReply;
beforeEach(() => {
  process.env.AI_ENABLED = 'true';
  process.env.OPENAI_API_KEY = config.apiKey;
  process.env.UPSTASH_REDIS_REST_URL = config.redisUrl;
  process.env.UPSTASH_REDIS_REST_TOKEN = config.redisToken;
  process.env.RATE_LIMIT_SALT = config.salt;
  calls = []; aiPayload = undefined;
  aiReply = { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ ingredients: ['白菜'] }), annotations: [] }] }] };
  redisReply = [0, 0];
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    if (String(url).startsWith(config.redisUrl)) return Response.json({ result: redisReply });
    if (String(url).startsWith('https://api.openai.com/')) {
      aiPayload = JSON.parse(init.body);
      return Response.json({ object: 'response', ...aiReply });
    }
    throw new Error('Unexpected network destination');
  };
});
afterEach(() => { globalThis.fetch = originalFetch; process.env = { ...originalEnv }; });
const jsonRequest = data => new Request('http://localhost/api/recipes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
async function imageRequest(type = 'image/png', bytes) {
  const form = new FormData();
  form.append('image', new File([bytes || await sharp({ create: { width: 10, height: 10, channels: 3, background: '#00ff00' } }).png().toBuffer()], 'food', { type }));
  return new Request('http://localhost/api/analyze', { method: 'POST', body: form });
}

test('contracts reject malformed or excessive output and allow no ingredients', () => {
  assert.deepEqual(analysisSchema.parse({ ingredients: [] }), { ingredients: [] });
  for (const ingredients of ['', [' '], Array(31).fill('卵'), ['a'.repeat(81)], { egg: true }, [3]]) assert.equal(recipeInputSchema.safeParse({ ingredients }).success, false);
  assert.equal(recipesSchema.safeParse(validRecipes).success, true);
  for (const recipes of [null, [], [recipe], [{ ...recipe, steps: 'bad' }, recipe, recipe]]) assert.equal(recipesSchema.safeParse({ recipes }).success, false);
});
test('production fails closed without key, shared limiter or salt; disabled switch works', () => {
  const env = { NODE_ENV: 'production', AI_ENABLED: 'true', OPENAI_API_KEY: 'x' };
  assert.throws(() => getConfig(env), { code: 'CONFIGURATION' });
  assert.throws(() => getConfig({ ...env, AI_ENABLED: 'false' }), { code: 'DISABLED' });
  assert.throws(() => getConfig({ ...env, UPSTASH_REDIS_REST_URL: config.redisUrl, UPSTASH_REDIS_REST_TOKEN: 'x', RATE_LIMIT_SALT: config.salt, AI_DAILY_CALL_LIMIT: 'NaN' }), { code: 'CONFIGURATION' });
});
test('untrusted forwarded headers cannot obtain a fresh caller quota', () => {
  const a = new Request('http://localhost', { headers: { 'x-forwarded-for': '1.1.1.1' } });
  const b = new Request('http://localhost', { headers: { 'x-forwarded-for': '2.2.2.2' } });
  assert.equal(clientKey(a, config), clientKey(b, config));
  assert.notEqual(clientKey(a, { ...config, ipHeader: 'x-forwarded-for' }), clientKey(b, { ...config, ipHeader: 'x-forwarded-for' }));
});
test('stream cap is enforced without Content-Length', async () => {
  const req = new Request('http://localhost', { method: 'POST', body: new ReadableStream({ start(c) { c.enqueue(new Uint8Array(20)); c.close(); } }), duplex: 'half' });
  await assert.rejects(readLimited(req, 10), { status: 413 });
});
test('JSON input rejects bad media type, malformed JSON and invalid shape', async () => {
  await assert.rejects(readIngredients(new Request('http://localhost', { method: 'POST', body: '{}' })), { status: 415 });
  await assert.rejects(readIngredients(new Request('http://localhost', { method: 'POST', body: '{', headers: { 'content-type': 'application/json' } })), { status: 400 });
  await assert.rejects(readIngredients(jsonRequest({ ingredients: [' '] })), { status: 400 });
  assert.deepEqual(await readIngredients(jsonRequest({ ingredients: [' 白菜 '] })), ['白菜']);
});
test('actual image decode, normalization and spoofed/corrupt/oversize rejection', async () => {
  assert.match(await readImage(await imageRequest()), /^data:image\/jpeg;base64,/);
  await assert.rejects(readImage(await imageRequest('image/jpeg')), { status: 415 });
  await assert.rejects(readImage(await imageRequest('image/png', Buffer.from('not a picture'))), { status: 415 });
  await assert.rejects(readImage(await imageRequest('image/png', Buffer.alloc(MAX_IMAGE_BYTES + 1))), { status: 413 });
});
test('shared limiter returns 429 with wait time and denies on backend failure', async () => {
  redisReply = [1, 120];
  await assert.rejects(acquire(jsonRequest({}), config), { status: 429, retryAfter: 120 });
  globalThis.fetch = async () => { throw new Error('secret backend message'); };
  await assert.rejects(acquire(jsonRequest({}), config), { status: 503, code: 'LIMITER_UNAVAILABLE' });
});
test('development limiter admits atomically, releases and keeps spent daily quota', async () => {
  process.env.NODE_ENV = 'test';
  const dev = { ...config, redisUrl: undefined, redisToken: undefined, dailyLimit: 1 };
  const results = await Promise.allSettled([acquire(jsonRequest({}), dev), acquire(jsonRequest({}), dev)]);
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
  await results.find(x => x.status === 'fulfilled').value();
  await assert.rejects(acquire(jsonRequest({}), dev), { code: 'DAILY_LIMIT' });
});
test('OpenAI request uses strict schema, bounded output, no stored response', async () => {
  assert.deepEqual(await generate('analyze', 'data:image/jpeg;base64,AA==', config, new AbortController().signal), { ingredients: ['白菜'] });
  assert.equal(aiPayload.model, 'gpt-5-mini');
  assert.equal(aiPayload.store, false);
  assert.equal(aiPayload.text.format.strict, true);
  assert.equal(aiPayload.text.format.schema.additionalProperties, false);
  assert.equal(aiPayload.max_output_tokens, 1200);
});
test('AI refusal, truncation, malformed JSON and invalid nested data are rejected', async () => {
  aiReply = { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] };
  await assert.rejects(generate('analyze', 'x', config, new AbortController().signal), { code: 'AI_REFUSAL' });
  aiReply = { status: 'incomplete', output: [] };
  await assert.rejects(generate('analyze', 'x', config, new AbortController().signal), { code: 'AI_INCOMPLETE' });
  for (const text of ['```json {} ```', '{"recipes":null}', JSON.stringify({ recipes: [recipe] })]) {
    aiReply = { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text, annotations: [] }] }] };
    await assert.rejects(generate('recipes', ['卵'], config, new AbortController().signal), { code: 'AI_INVALID' });
  }
});
test('API success validates recipe response and separates instructions from ingredient data', async () => {
  aiReply.output[0].content[0].text = JSON.stringify(validRecipes);
  const response = await handle(jsonRequest({ ingredients: ['卵'] }), 'recipes');
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).recipes, validRecipes.recipes);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(aiPayload.input, JSON.stringify({ ingredients: ['卵'] }));
  assert.equal(aiPayload.max_output_tokens, 5000);
  assert.equal(calls.filter(x => x.startsWith('https://api.openai.com')).length, 1);
  assert.equal(calls.filter(x => x.startsWith(config.redisUrl)).length, 2);
});
test('configuration errors and exhausted quota make no OpenAI call', async () => {
  delete process.env.OPENAI_API_KEY;
  assert.equal((await handle(jsonRequest({ ingredients: ['卵'] }), 'recipes')).status, 503);
  assert.equal(calls.length, 0);
  process.env.OPENAI_API_KEY = config.apiKey;
  redisReply = [2, 30];
  const response = await handle(jsonRequest({ ingredients: ['卵'] }), 'recipes');
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '30');
  assert.equal(calls.filter(x => x.startsWith('https://api.openai.com')).length, 0);
});
test('bad input releases reservation without calling AI', async () => {
  const response = await handle(jsonRequest({ ingredients: [4] }), 'recipes');
  assert.equal(response.status, 400);
  assert.equal(calls.length, 2);
});
test('provider errors are sanitized, mapped and never automatically retried', async () => {
  globalThis.fetch = async url => { calls.push(String(url)); return Response.json({ error: { message: 'DO_NOT_LEAK_SECRET', type: 'rate_limit_error' } }, { status: 429 }); };
  let caught;
  try { await generate('recipes', ['卵'], config, new AbortController().signal); } catch (error) { caught = error; }
  assert.equal(mapError(caught).code, 'AI_BUSY');
  assert.equal(calls.length, 1);
  assert.equal(mapError(caught).message.includes('DO_NOT_LEAK'), false);
  assert.equal(mapError(new OpenAI.APIConnectionTimeoutError()).status, 504);
  assert.equal(mapError(new Error('DO_NOT_LEAK_SECRET')).message.includes('DO_NOT_LEAK'), false);
});
test('client handles non-JSON errors and rejects wrong success shapes', async () => {
  globalThis.fetch = async () => new Response('<h1>Gateway error</h1>', { status: 502 });
  await assert.rejects(postApi('/api/recipes', { ingredients: ['卵'] }, recipesSchema, new AbortController().signal), /返答を読み取れません/);
  globalThis.fetch = async () => Response.json({ recipes: null });
  await assert.rejects(postApi('/api/recipes', { ingredients: ['卵'] }, recipesSchema, new AbortController().signal), /形式が正しくありません/);
});
