const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const Langton = require('../../web/static/js/langton-engine.js');
const source = fs.readFileSync('web/static/js/langton.js', 'utf8');
function boot(storage, now, options = {}) {
  const events = {}, elements = {};
  const translations = [];
  const context = new Proxy({}, { get: (_, name) => name === 'translate' ? (x, y) => translations.push([x, y]) : () => {} });
  for (const id of ['ant-canvas', 'ant-storage', 'ant-view', 'ant-steps', 'ant-position', 'ant-phase', 'ant-start', 'ant-follow', 'ant-origin', 'ant-zoom-out', 'ant-zoom-in', 'ant-zoom', 'ant-camera']) {
    elements[id] = { textContent: '', clientWidth: 120, clientHeight: 120, getContext: () => context,
      focus() {}, setPointerCapture() {}, getBoundingClientRect: () => ({ left: 0, top: 0 }),
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
  return { elements, translations, tick: () => tick(), events, sandbox };
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


test('explorar mantém a câmera livre e seguir recentraliza na formiga', () => {
  const now = { value: 1700000000000 }, ui = boot(new Map(), now);
  const canvas = ui.elements['ant-canvas'];
  canvas.pointerdown({ button: 0, pointerId: 1, clientX: 60, clientY: 60 });
  canvas.pointermove({ pointerId: 1, clientX: 84, clientY: 72 });
  assert.deepEqual(ui.translations.at(-1), [84, 72]);
  assert.equal(ui.elements['ant-camera'].textContent, 'Explorando a grade');
  canvas.pointerup({ pointerId: 1 });
  now.value += 1000; ui.tick();
  assert.equal(ui.elements['ant-steps'].textContent, '5');
  assert.notDeepEqual(ui.translations.at(-1), [60, 60]);
  ui.elements['ant-follow'].click();
  assert.deepEqual(ui.translations.at(-1), [60, 60]);
  ui.elements['ant-origin'].click();
  const state = Langton.engine()(5);
  assert.deepEqual(ui.translations.at(-1), [60 + state.x * 12, 60 + state.y * 12]);
});

test('zoom e teclado funcionam congelados, com limites e âncora no cursor', () => {
  const now = { value: 1700000000000 }, ui = boot(new Map(), now, { reduced: true });
  const el = ui.elements, canvas = el['ant-canvas'];
  canvas.keydown({ key: 'ArrowRight', preventDefault() {} });
  assert.deepEqual(ui.translations.at(-1), [0, 60]);
  canvas.wheel({ deltaY: -100, clientX: 0, clientY: 60, preventDefault() {} });
  assert.ok(Math.abs(ui.translations.at(-1)[0]) < 1e-10);
  for (let i = 0; i < 30; i++) el['ant-zoom-in'].click();
  assert.equal(el['ant-zoom'].textContent, '300%');
  assert.equal(el['ant-zoom-in'].disabled, true);
  for (let i = 0; i < 30; i++) el['ant-zoom-out'].click();
  assert.equal(el['ant-zoom'].textContent, '33%');
  assert.equal(el['ant-zoom-out'].disabled, true);
  canvas.keydown({ key: 'Home', preventDefault() {} });
  assert.deepEqual(ui.translations.at(-1), [60, 60]);
  now.value += 10000; ui.tick();
  assert.equal(el['ant-steps'].textContent, '0');
  el['ant-view'].click();
  assert.equal(el['ant-steps'].textContent, '50');
});

test('cancelar o toque encerra o arraste', () => {
  const ui = boot(new Map(), { value: 1700000000000 });
  const canvas = ui.elements['ant-canvas'];
  canvas.pointerdown({ button: 0, pointerId: 1, clientX: 60, clientY: 60 });
  canvas.pointercancel({ pointerId: 1 });
  canvas.pointermove({ pointerId: 1, clientX: 90, clientY: 90 });
  assert.deepEqual(ui.translations.at(-1), [60, 60]);
});
