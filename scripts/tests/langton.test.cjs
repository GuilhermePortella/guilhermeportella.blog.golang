const { test } = require('node:test');
const assert = require('node:assert/strict');
const { create, step, engine, target } = require('../../web/static/js/langton-engine.js');

test('luzes ligadas viram à direita; apagadas viram à esquerda', () => {
  const s = create();
  assert.equal(s.on.size, 0);
  assert.equal(engine()(0).on(10, -10), false);
  step(s);
  assert.deepEqual([s.x, s.y, s.dir], [-1, 0, 3]);
  assert.equal(s.on.has('0,0'), true);
  for (let i = 0; i < 4; i++) step(s);
  assert.deepEqual([s.x, s.y, s.dir], [1, 0, 1]);
  assert.equal(s.on.has('0,0'), false);
});

test('atalho da estrada coincide com evolução passo a passo e luzes do caminho', () => {
  const at = engine(), s = create();
  for (const n of [0, 1, 100, 11999, 12000, 12001, 12103, 12104, 13000, 50000, 100000]) {
    while (s.steps < n) step(s);
    const fast = at(n);
    assert.deepEqual([fast.x, fast.y, fast.dir], [s.x, s.y, s.dir]);
    for (let y = -18; y <= 18; y++) for (let x = -18; x <= 18; x++) {
      assert.equal(fast.on(s.x + x, s.y + y), s.on.has(`${s.x + x},${s.y + y}`), `step ${n}, offset ${x},${y}`);
      assert.equal(fast.on(x, y), s.on.has(`${x},${y}`));
    }
    for (const cell of s.on) {
      const [x, y] = cell.split(',').map(Number);
      assert.equal(fast.on(x, y), true, `missing ${cell} at ${n}`);
    }
  }
});

test('retorno depois de anos usa o mesmo relógio e a mesma estrada', () => {
  const start = 1700000000000, year = 365 * 86400000;
  const n = target(start, start + 10 * year), at = engine();
  const a = at(n), b = at(n + 104);
  assert.deepEqual([b.x - a.x, b.y - a.y, b.dir], [2, 2, a.dir]);
  for (let y = -8; y <= 8; y++) for (let x = -8; x <= 8; x++) {
    assert.equal(a.on(a.x + x, a.y + y), b.on(b.x + x, b.y + y));
  }
  assert.equal(target(start, start - 1000), 0);
  assert.equal(target(start, start + 1000), 5);
});
