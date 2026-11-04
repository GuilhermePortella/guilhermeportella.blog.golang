const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const source = readFileSync('web/static/js/consent.js', 'utf8');
const NOW = Date.UTC(2026, 10, 3);
const TTL = 180 * 24 * 60 * 60 * 1000;
function setup(initial, broken = false) {
  let now = NOW;
  let stored = initial;
  const events = {};
  const timers = new Map();
  let timerID = 0;
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.isConnected = true; this.classList = { add() {} }; this.handlers = {}; }
    replaceChildren(...items) {
      for (const child of this.children) child.isConnected = false;
      this.children = items;
    }
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
  vm.runInNewContext(source, { window, document, URL, Date: { now: () => now },
    setTimeout: (fn, delay) => { timers.set(++timerID, { fn, delay }); return timerID; },
    clearTimeout: id => timers.delete(id),
    localStorage: {
    getItem() { if (broken) throw Error(); return stored; },
    setItem(key, value) { if (broken) throw Error(); stored = value; },
  }});
  const host = new Element('div');
  window.siteConsent.mount(host, { title: 'Player', src: 'https://www.youtube-nocookie.com/embed/test' });
  return { host, elements, events, window, document, Element, timers, advance: ms => { now += ms; }, stored: () => stored, setStored: value => stored = value };
}
const saved = (allowed, savedAt = NOW) => JSON.stringify({ version: 1, allowed, savedAt });
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
  for (const [record, allowed] of [[saved(true),true],[saved(false),false],['invalid',false],[saved(true,0),false],[saved(true,NOW+60000),false]]) {
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
  s.elements['[data-consent-accept]'].click();
  assert.equal(s.document.activeElement, s.elements['[data-consent-open]']);
  assert.equal(s.document.activeElement.focusOptions?.preventScroll, true);
});

for (const allowed of [true, false]) {
  test(`consent expires at 180 days when the tab regains focus (allowed=${allowed})`, () => {
    const s = setup(saved(allowed));
    s.advance(TTL - 1);
    s.events.focus();
    assert.equal(s.elements['[data-consent-panel]'].hidden, true);
    assert.equal(s.host.children[0].tag === 'iframe', allowed);
    s.advance(1);
    s.events.focus();
    assert.equal(s.elements['[data-consent-panel]'].hidden, false);
    assert.equal(s.host.children.some(e => e.tag === 'iframe'), false);
  });
}

test('persisted consent validates types, version and exact expiration boundary', () => {
  const invalid = [
    null, {}, { version: 2, allowed: true, savedAt: NOW },
    { version: 1, allowed: 'true', savedAt: NOW },
    { version: 1, allowed: true, savedAt: String(NOW) },
    { version: 1, allowed: true, savedAt: null },
    { version: 1, allowed: true },
    { version: 1, allowed: true, savedAt: NOW + 1 },
    { version: 1, allowed: true, savedAt: NOW - TTL },
  ];
  for (const record of invalid) {
    const s = setup(JSON.stringify(record));
    assert.equal(s.host.children.some(e => e.tag === 'iframe'), false, JSON.stringify(record));
    assert.equal(s.elements['[data-consent-panel]'].hidden, false);
  }
  assert.equal(setup(saved(true, NOW - TTL + 1)).host.children[0].tag, 'iframe');
});

test('media only loads from supported HTTPS hosts, even after accepting', () => {
  const s = setup(null);
  const rejected = [
    'not a URL', 'javascript:alert(1)', '//www.youtube.com/embed/test',
    'http://www.youtube.com/embed/test',
    'https://www.youtube.com.evil.example/embed/test',
    'https://www.youtube.com@evil.example/embed/test',
    'https://evil.example/?url=https://open.spotify.com',
  ].map(src => {
    const host = new s.Element('div');
    s.window.siteConsent.mount(host, { title: 'Invalid', src });
    return host;
  });
  const supported = ['open.spotify.com', 'www.youtube.com', 'www.youtube-nocookie.com'].map(domain => {
    const host = new s.Element('div');
    const src = `https://${domain}/embed/test`;
    s.window.siteConsent.mount(host, { title: 'Player', src, height: '152' });
    assert.equal(host.children.some(e => e.tag === 'iframe'), false);
    return { host, src };
  });
  s.elements['[data-consent-accept]'].click();
  for (const host of rejected) assert.equal(host.children.length, 0);
  for (const { host, src } of supported) {
    assert.equal(host.children[0].tag, 'iframe');
    assert.equal(host.children[0].src, src);
    assert.equal(host.children[0].title, 'Player');
    assert.equal(host.children[0].height, '152');
  }
});

test('unrelated storage events do not reload media; cross-tab acceptance does', () => {
  const s = setup(saved(false));
  const placeholder = s.host.children[0];
  s.setStored(saved(true));
  s.events.storage({ key: 'unrelated-setting' });
  assert.equal(s.host.children[0], placeholder);
  s.events.storage({ key: 'gp:external-media-consent:v1' });
  assert.equal(s.host.children[0].tag, 'iframe');
  assert.equal(s.elements['[data-consent-panel]'].hidden, true);
});

test('disconnected media is not rendered again after a consent change', () => {
  const s = setup(null);
  const placeholder = s.host.children[0];
  s.host.isConnected = false;
  s.elements['[data-consent-accept]'].click();
  assert.equal(s.host.children[0], placeholder);
});
