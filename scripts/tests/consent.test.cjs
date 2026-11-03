const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const source = readFileSync('web/static/js/consent.js', 'utf8');
function setup(initial, broken = false) {
  let stored = initial;
  const events = {};
  const timers = new Map();
  let timerID = 0;
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.isConnected = true; this.classList = { add() {} }; this.handlers = {}; }
    replaceChildren(...items) { this.children = items; }
    append(...items) { this.children.push(...items); }
    addEventListener(name, fn) { this.handlers[name] = fn; }
    focus(options) { document.activeElement = this; this.focusOptions = options; }
    querySelector() { return elements['[data-consent-reject]']; }
    click() { this.handlers.click(); }
  }
  const elements = Object.fromEntries(['panel','status','open','accept','reject'].map(name => [`[data-consent-${name}]`, new Element('button')]));
  const document = {
    querySelector: key => elements[key],
    querySelectorAll: key => elements[key] ? [elements[key]] : [],
    createElement: tag => new Element(tag),
  };
  const window = { addEventListener: (name, fn) => events[name] = fn };
  vm.runInNewContext(source, { window, document, URL, Date,
    setTimeout: (fn, delay) => { timers.set(++timerID, { fn, delay }); return timerID; },
    clearTimeout: id => timers.delete(id),
    localStorage: {
    getItem() { if (broken) throw Error(); return stored; },
    setItem(key, value) { if (broken) throw Error(); stored = value; },
  }});
  const host = new Element('div');
  window.siteConsent.mount(host, { title: 'Player', src: 'https://www.youtube-nocookie.com/embed/test' });
  return { host, elements, events, window, document, Element, timers, stored: () => stored, setStored: value => stored = value };
}
const saved = (allowed, savedAt = Date.now()) => JSON.stringify({ version: 1, allowed, savedAt });
test('unknown choice blocks iframe; accept loads; revoke removes and persists', () => {
  const s = setup(null);
  assert.equal(s.host.children.some(e => e.tag === 'iframe'), false);
  assert.equal(s.elements['[data-consent-panel]'].hidden, false);
  s.elements['[data-consent-accept]'].click();
  assert.equal(s.host.children[0].tag, 'iframe');
  assert.equal(JSON.parse(s.stored()).allowed, true);
  s.elements['[data-consent-open]'].click();
  assert.equal(s.elements['[data-consent-panel]'].hidden, false);
  s.elements['[data-consent-reject]'].click();
  assert.equal(s.host.children.some(e => e.tag === 'iframe'), false);
  assert.equal(JSON.parse(s.stored()).allowed, false);
});
test('saved choices, corrupt, expired and future records', () => {
  for (const [record, allowed] of [[saved(true),true],[saved(false),false],['invalid',false],[saved(true,0),false],[saved(true,Date.now()+60000),false]]) {
    assert.equal(setup(record).host.children[0].tag === 'iframe', allowed);
  }
});
test('storage unavailable defaults to blocked and permits an in-page choice', () => {
  const s = setup(null,true);
  assert.notEqual(s.host.children[0].tag,'iframe');
  s.elements['[data-consent-accept]'].click();
  assert.equal(s.host.children[0].tag,'iframe');
  assert.match(s.elements['[data-consent-status]'].textContent,/apenas nesta página/);
});
test('cross-tab revocation and clearing storage remove active frames', () => {
  const s = setup(saved(true));
  s.setStored(saved(false));
  s.events.storage({key:'gp:external-media-consent:v1'});
  assert.notEqual(s.host.children[0].tag,'iframe');
  s.setStored(null);
  s.events.storage({key:null});
  assert.equal(s.elements['[data-consent-panel]'].hidden,false);
});
test('newly rendered media respects saved preference and rejects other providers', () => {
  const s = setup(saved(true));
  const host = new s.Element('div');
  s.window.siteConsent.mount(host,{title:'Spotify',src:'https://open.spotify.com/embed/track/test'});
  assert.equal(host.children[0].tag,'iframe');
  const invalid = new s.Element('div');
  s.window.siteConsent.mount(invalid,{title:'Other',src:'https://example.com/embed/test'});
  assert.equal(invalid.children.length,0);
});

test('confirmation disappears after five seconds and a new choice restarts the timer', () => {
  const s = setup(null);
  const status = s.elements['[data-consent-status]'];
  s.elements['[data-consent-accept]'].click();
  assert.match(status.textContent, /autorizados/);
  s.elements['[data-consent-reject]'].click();
  assert.equal(s.timers.size, 1);
  const timer = [...s.timers.values()][0];
  assert.equal(timer.delay, 5000);
  assert.match(status.textContent, /bloqueados/);
  timer.fn();
  assert.equal(status.textContent, '');
  assert.equal(JSON.parse(s.stored()).allowed, false);
});

for (const action of ['accept', 'reject']) {
  test(`${action} restores focus without scrolling to the footer on first choice`, () => {
    const s = setup(null);
    s.elements[`[data-consent-${action}]`].click();
    const opener = s.elements['[data-consent-open]'];
    assert.equal(s.document.activeElement, opener);
    assert.equal(opener.focusOptions?.preventScroll, true);
  });

  test(`${action} returns focus without scrolling after reopening preferences`, () => {
    const s = setup(saved(false));
    const origin = new s.Element('button');
    origin.focus();
    s.elements['[data-consent-open]'].click();
    assert.equal(s.document.activeElement, s.elements['[data-consent-reject]']);
    assert.equal(s.document.activeElement.focusOptions?.preventScroll, true);
    s.elements[`[data-consent-${action}]`].click();
    assert.equal(s.document.activeElement, origin);
    assert.equal(origin.focusOptions?.preventScroll, true);
  });
}

test('removed media opener falls back to the footer without scrolling', () => {
  const s = setup(null);
  const opener = s.host.children[1];
  opener.focus();
  opener.click();
  opener.isConnected = false;
  s.elements['[data-consent-accept]'].click();
  assert.equal(s.document.activeElement, s.elements['[data-consent-open]']);
  assert.equal(s.document.activeElement.focusOptions?.preventScroll, true);
});
