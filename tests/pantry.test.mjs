import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePantry, SEASONINGS, expiryStatus, availableSeasonings, parseDatedPantry, validDate } from '../lib/pantry.ts';
import { readIngredients } from '../lib/server/input.ts';
test('best-before dates use calendar-day boundaries and exclude expired pantry items', () => {
  assert.equal(validDate('2028-02-29'), true);
  assert.equal(validDate('2026-02-29'), false);
  assert.equal(expiryStatus('', '2026-09-24'), '未登録');
  assert.equal(expiryStatus('2026-09-23', '2026-09-24'), '期限切れ');
  assert.equal(expiryStatus('2026-09-24', '2026-09-24'), '本日まで');
  assert.equal(expiryStatus('2026-10-01', '2026-09-24'), '7日以内');
  assert.equal(expiryStatus('2026-10-02', '2026-09-24'), '期限内');
  const items = [{ name: '塩', bestBefore: '' }, { name: '醤油', bestBefore: '2026-09-23' }, { name: '味噌', bestBefore: '2026-09-24' }];
  assert.deepEqual(parseDatedPantry(JSON.stringify(items)), items);
  assert.deepEqual(availableSeasonings(items, '2026-09-24'), ['塩', '味噌']);
  assert.deepEqual(availableSeasonings(items, '2026-09-25'), ['塩']);
  for (const raw of ['null', '[{}]', '[{"name":"塩","bestBefore":"2026-02-30"}]', JSON.stringify([items[0], items[0]])]) assert.throws(() => parseDatedPantry(raw));
});

test('pantry restores selections, deduplicates and rejects damaged data', () => {
  assert.deepEqual(parsePantry(null), []);
  assert.deepEqual(parsePantry('[]'), []);
  assert.deepEqual(parsePantry('["塩","醤油","塩"]'), ['塩', '醤油']);
  for (const raw of ['{', '{}', '[null]', '["unknown"]']) assert.throws(() => parsePantry(raw));
});
test('saved seasonings reach recipe input without consuming the 30 ingredient slots', async () => {
  const request = data => new Request('http://localhost/api/recipes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
  assert.deepEqual(await readIngredients(request({ ingredients: ['卵', '塩'], seasonings: ['塩', '醤油'] })), ['卵', '塩', '醤油']);
  assert.equal((await readIngredients(request({ ingredients: Array.from({length: 30}, (_, i) => `食材${i}`), seasonings: [...SEASONINGS] }))).length, 50);
  await assert.rejects(readIngredients(request({ ingredients: [], seasonings: ['塩'] })), { code: 'INVALID_INGREDIENTS' });
  await assert.rejects(readIngredients(request({ ingredients: ['卵'], seasonings: ['unknown'] })), { code: 'INVALID_INGREDIENTS' });
});
