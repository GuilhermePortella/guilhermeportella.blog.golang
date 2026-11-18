const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const Langton = require('../../web/static/js/langton-engine.js');
const source = fs.readFileSync('web/static/js/langton.js', 'utf8');
function boot(storage, now, options = {}) {
  const events = {}, elements = {};
  const context = new Proxy({}, { get: () => () => {} });
  for (const id of ['ant-canvas', 'ant-storage', 'ant-view', 'ant-steps', 'ant-position', 'ant-phase', 'ant-start']) {
    elements[id] = { textContent: '', clientWidth: 120, clientHeight: 120, getContext: () => context,
      setAttribute() {}, addEventListener(name, fn) { this[name] = fn; } };
  }
  let tick;
  class Clock extends Date { static now() { return now.value; } }
  const sandbox = { Langton, Date: Clock, Intl, Math, Number, String, devicePixelRatio: 1,
    document: { hidden: false, getElementById: id => elements[id], addEventListener: (n, fn) => { events[n] = fn; } },
    window: { addEventListener: (n, fn) => { events[n] = fn; } },
    localStorage: { getItem: key => { if (options.blocked) throw Error(); return storage.get(key) ?? null; }, setItem: (key, value) => storage.set(key, value) },
    matchMedia: () => ({ matches: !!options.reduced }), setInterval: fn => { tick = fn; } };
  vm.runInNewContext(source, sandbox);
  return { elements, tick: () => tick(), events, sandbox };
}

test('primeira visita salva início; recarregar recupera tempo ausente sem duplicar passos', () => {
  const storage = new Map(), now = { value: 1700000000000 };
  const first = boot(storage, now);
  assert.equal(first.elements['ant-steps'].textContent, '0');
  now.value += 86400000;
  const second = boot(storage, now);
  first.tick();
  assert.equal(second.elements['ant-steps'].textContent, '432.000');
  assert.equal(first.elements['ant-position'].textContent, second.elements['ant-position'].textContent);
  assert.equal(storage.get('gp:langton:start:v1'), '1700000000000');
});
test('congelar e movimento reduzido preservam relógio da jornada', () => {
  const now = { value: 1700000000000 }, ui = boot(new Map(), now, { reduced: true });
  now.value += 10000; ui.tick();
  assert.equal(ui.elements['ant-steps'].textContent, '0');
  ui.elements['ant-view'].click();
  assert.equal(ui.elements['ant-steps'].textContent, '50');
});
test('armazenamento bloqueado e inválido não impedem a simulação', () => {
  const now = { value: 1700000000000 };
  const blocked = boot(new Map(), now, { blocked: true });
  assert.match(blocked.elements['ant-storage'].textContent, /bloqueou/);
  now.value += 1000; blocked.tick();
  assert.equal(blocked.elements['ant-steps'].textContent, '5');
  for (const bad of ['NaN', 'Infinity', '-1', '9999999999999', '{}']) {
    const store = new Map([['gp:langton:start:v1', bad]]);
    const ui = boot(store, now);
    assert.equal(ui.elements['ant-steps'].textContent, '0');
    assert.equal(store.get('gp:langton:start:v1'), String(now.value));
  }
});
