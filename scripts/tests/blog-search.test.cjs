const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

// Exercise the production initializer in isolation from unrelated page widgets.
const source = readFileSync('web/static/js/site.js', 'utf8');
const start = source.indexOf('  function setupBlogSearch(');
const end = source.indexOf('  function setupBlogFilters(', start);
assert.ok(start >= 0 && end > start);

function setup(search = '') {
  const opened = [];
  const document = { activeElement: null };
  class Element {
    constructor(tag) {
      this.tag = tag;
      this.children = [];
      this.handlers = {};
      this.dataset = {};
      this.classList = { toggle() {} };
    }
    set textContent(value) { this.text = value; this.children = []; }
    get textContent() { return this.text || ''; }
    append(child) { this.children.push(child); }
    addEventListener(type, handler) { this.handlers[type] = handler; }
    focus() { document.activeElement = this; }
    click() { opened.push(this.href); }
    querySelectorAll(tag) {
      return this.children.flatMap(child => [
        ...(child.tag === tag ? [child] : []), ...child.querySelectorAll(tag),
      ]);
    }
    emit(type, properties = {}) {
      const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...properties };
      this.handlers[type]?.(event);
      return event;
    }
  }
  document.createElement = tag => new Element(tag);
  const input = new Element('input');
  const form = new Element('form');
  const results = new Element('div');
  const cards = [
    ['Arquitetura Go', 'arquitetura serviços go', '/blog/go'],
    ['Arquitetura Java', 'arquitetura serviços java', '/blog/java'],
  ].map(([title, search, url]) => {
    const card = new Element('a');
    card.dataset = { title, search, url };
    return card;
  });
  const elements = { '[data-blog-search-input]': input, '[data-blog-search-form]': form, '[data-blog-search-results]': results };
  const browser = { querySelector: selector => elements[selector], querySelectorAll: () => cards };
  const window = {
    location: { search, pathname: '/blog', hash: '#texts' },
    handlers: {},
    addEventListener(type, handler) { this.handlers[type] = handler; },
    history: { replaceState(_state, _unused, url) { window.lastURL = url; } },
  };
  vm.runInNewContext(`${source.slice(start, end)}\nsetupBlogSearch(browser);`, {
    browser, document, window, URLSearchParams,
    setHidden(element, hidden) { element.hidden = hidden; },
  });
  return {
    input, form, results, document, window, opened,
    links: () => results.querySelectorAll('a'),
    search(value) { input.focus(); input.value = value; input.emit('input'); },
    key(key, properties) {
      return (document.activeElement === input ? input : results).emit('keydown', { key, ...properties });
    },
  };
}

test('submit opens the unique match, including accent-insensitive queries', () => {
  const s = setup('?filter=all');
  s.search('  SERVICOS GO  ');
  assert.equal(s.links().length, 1);
  assert.deepEqual(s.opened, []);
  assert.equal(s.form.emit('submit').defaultPrevented, true);
  assert.deepEqual(s.opened, ['/blog/go']);
  assert.equal(s.window.lastURL, '/blog?filter=all&q=SERVICOS+GO#texts');
});

test('multiple matches focus the first result without opening an article', () => {
  const s = setup();
  s.search('arquitetura');
  s.form.emit('submit');
  assert.equal(s.document.activeElement, s.links()[0]);
  assert.deepEqual(s.opened, []);
  // Enter remains a native link action: the search handler must not cancel it.
  assert.equal(s.key('Enter').defaultPrevented, false);
  assert.equal(s.links()[0].href, '/blog/go');
});

test('arrows select and wrap results; Escape returns focus to the input', () => {
  const s = setup();
  s.search('arquitetura');
  assert.equal(s.key('ArrowDown').defaultPrevented, true);
  assert.equal(s.document.activeElement, s.links()[0]);
  s.key('ArrowDown');
  assert.equal(s.document.activeElement, s.links()[1]);
  s.key('ArrowDown');
  assert.equal(s.document.activeElement, s.links()[0]);
  s.key('ArrowUp');
  assert.equal(s.document.activeElement, s.links()[1]);
  s.key('Escape');
  assert.equal(s.document.activeElement, s.input);
  s.key('ArrowUp');
  assert.equal(s.document.activeElement, s.links()[1]);
  assert.equal(s.key('Tab').defaultPrevented, false);
  assert.deepEqual(s.opened, []);
});

test('empty and unmatched queries do not navigate or intercept arrows', () => {
  const s = setup();
  for (const query of ['missing', '   ']) {
    s.search(query);
    s.form.emit('submit');
    assert.equal(s.links().length, 0);
    assert.deepEqual(s.opened, []);
    assert.equal(s.document.activeElement, s.input);
    assert.equal(s.key('ArrowDown').defaultPrevented, false);
    assert.equal(s.results.hidden, query.trim() === '');
  }
  assert.equal(s.window.lastURL, '/blog#texts');
});

test('editing the query replaces stale matches before navigation', () => {
  const s = setup();
  s.search('go');
  s.key('ArrowDown');
  s.key('Escape');
  s.search('java');
  s.form.emit('submit');
  assert.deepEqual(s.opened, ['/blog/java']);
});

test('URL initialization and history navigation render without opening articles', () => {
  const s = setup('?q=go');
  assert.equal(s.input.value, 'go');
  assert.equal(s.links()[0].href, '/blog/go');
  s.window.location.search = '?q=java';
  s.window.handlers.popstate();
  assert.equal(s.input.value, 'java');
  assert.equal(s.links()[0].href, '/blog/java');
  assert.deepEqual(s.opened, []);
});

test('composition keystrokes do not move focus', () => {
  const s = setup();
  s.search('arquitetura');
  assert.equal(s.key('ArrowDown', { isComposing: true }).defaultPrevented, false);
  assert.equal(s.document.activeElement, s.input);
});
