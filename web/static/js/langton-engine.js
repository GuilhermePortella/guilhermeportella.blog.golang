/* Exact infinite-grid Langton evolution; lit cells are stored, all others are off.
 * After step 12000 the standard seed is on its 104-step translating highway.
 * Query repeated toggles algebraically so years away cost no extra replay/memory. */
(function (root) {
  'use strict';
  const BASE = 12000, PERIOD = 104, RATE = 5;
  const key = (x, y) => `${x},${y}`;
  function create() { return { x: 0, y: 0, dir: 0, steps: 0, on: new Set() }; }
  function step(s) {
    const k = key(s.x, s.y), on = s.on.has(k);
    s.dir = (s.dir + (on ? 1 : 3)) % 4;
    if (on) s.on.delete(k); else s.on.add(k);
    s.x += [0, 1, 0, -1][s.dir]; s.y += [-1, 0, 1, 0][s.dir]; s.steps++;
  }
  function engine() {
    let early = create();
    const seed = create();
    while (seed.steps < BASE) step(seed);
    const baseOn = new Set(seed.on), path = [];
    for (let i = 0; i < PERIOD; i++) {
      path.push({ x: seed.x, y: seed.y, dir: seed.dir }); step(seed);
    }
    const dx = seed.x - path[0].x, dy = seed.y - path[0].y;
    return function at(n) {
      if (!Number.isSafeInteger(n) || n < 0) throw new RangeError('Invalid step');
      if (n < BASE) {
        if (early.steps > n) early = create();
        while (early.steps < n) step(early);
        const on = new Set(early.on);
        return { x: early.x, y: early.y, dir: early.dir, on: (x, y) => on.has(key(x, y)) };
      }
      const cycles = Math.floor((n - BASE) / PERIOD), rest = (n - BASE) % PERIOD;
      const p = path[rest];
      return { x: p.x + cycles * dx, y: p.y + cycles * dy, dir: p.dir, on(x, y) {
        let value = baseOn.has(key(x, y));
        for (let i = 0; i < PERIOD; i++) {
          const k = (x - path[i].x) / dx;
          if (Number.isInteger(k) && k >= 0 && k < cycles && y === path[i].y + k * dy) value = !value;
          if (i < rest && x === path[i].x + cycles * dx && y === path[i].y + cycles * dy) value = !value;
        }
        return value;
      } };
    };
  }
  function target(start, now) { return Math.max(0, Math.floor((now - start) * RATE / 1000)); }
  const api = { create, step, engine, target };
  if (typeof module !== 'undefined') module.exports = api; else root.Langton = api;
})(globalThis);
