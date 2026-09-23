import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePantry, SEASONINGS } from '../lib/pantry.ts';
import { readIngredients } from '../lib/server/input.ts';

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
