const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const vm = require('node:vm');

const source = readFileSync('web/static/service-worker.js', 'utf8');

function setup({ scope = 'https://site.example/', network, cached, names = [], installError } = {}) {
  const events = {};
  const calls = { fetch: [], match: [], deleted: [], lifecycle: [], precache: [] };
  vm.runInNewContext(source, {
    URL, Response,
    self: {
      registration: { scope }, location: { origin: new URL(scope).origin },
      addEventListener: (name, handler) => { events[name] = handler; },
      skipWaiting: async () => { calls.lifecycle.push('skipWaiting'); },
      clients: { claim: async () => { calls.lifecycle.push('claim'); } },
    },
    caches: {
      open: async name => {
        calls.currentCache = name;
        return { addAll: async urls => {
          if (installError) throw installError;
          calls.precache.push(...urls);
          calls.lifecycle.push('precache');
        } };
      },
      keys: async () => names,
      delete: async name => { calls.deleted.push(name); calls.lifecycle.push('delete'); return true; },
      match: async request => { calls.match.push(request); return cached; },
    },
    fetch: async request => {
      calls.fetch.push(request);
      if (network instanceof Error) throw network;
      return network || new Response('online');
    },
  });
  return {
    calls,
    lifecycle(name) {
      let completion;
      events[name]({ waitUntil(promise) { completion = promise; } });
      assert.ok(completion, `${name} must keep the worker alive until completion`);
      return completion;
    },
    fetch({ url = `${scope}static/css/main.css`, method = 'GET', mode = 'cors', accept = '*/*' } = {}) {
      const request = { url, method, mode, headers: new Headers({ accept }) };
      let response;
      events.fetch({ request, respondWith(promise) { response = promise; } });
      return response;
    },
  };
}

for (const scope of ['https://site.example/', 'https://site.example/blog/']) {
  test(`installation caches local assets inside the deployment scope: ${scope}`, async () => {
    const s = setup({ scope });
    await s.lifecycle('install');
    assert.deepEqual(s.calls.lifecycle, ['precache', 'skipWaiting']);
    assert.ok(s.calls.precache.includes(new URL('./erro/', scope).href));
    assert.equal(new Set(s.calls.precache).size, s.calls.precache.length);
    for (const url of s.calls.precache) {
      assert.ok(url.startsWith(scope), url);
      const relative = url.slice(scope.length).split('?')[0];
      if (relative.startsWith('static/')) assert.ok(existsSync(`web/${relative}`), `Missing precache file: ${relative}`);
    }
    // Catch removed stylesheets and cache versions that no longer match the page.
    const main = readFileSync('web/static/css/main.css', 'utf8');
    const base = readFileSync('web/templates/layouts/base.html', 'utf8');
    for (const [, asset] of main.matchAll(/@import url\("([^"]+)"\)/g)) {
      assert.ok(s.calls.precache.includes(new URL(asset, new URL('static/css/main.css', scope)).href), asset);
    }
    for (const [, asset] of base.matchAll(/(?:href|src)="(\/static\/(?:css|js)\/[^"?]+\?[^\"]+)"/g)) {
      assert.ok(s.calls.precache.includes(new URL(asset.slice(1), scope).href), asset);
    }
  });
}

test('failed precaching rejects installation instead of activating an incomplete cache', async () => {
  const failure = new Error('asset unavailable');
  const s = setup({ installError: failure });
  await assert.rejects(s.lifecycle('install'), error => error === failure);
  assert.deepEqual(s.calls.lifecycle, []);
});

test('activation removes only outdated site caches before claiming clients', async () => {
  const probe = setup();
  await probe.lifecycle('install');
  const current = probe.calls.currentCache;
  const old = 'guilherme-portella-site-obsolete';
  const s = setup({ names: [old, current, 'another-application'] });
  await s.lifecycle('activate');
  assert.deepEqual(s.calls.deleted, [old]);
  assert.deepEqual(s.calls.lifecycle, ['delete', 'claim']);
});

for (const request of [{ mode: 'navigate' }, { accept: 'text/html,application/xhtml+xml' }]) {
  test(`navigation uses the network and the scoped offline page on failure: ${JSON.stringify(request)}`, async () => {
    const network = new Response('fresh page');
    const online = setup({ network, cached: new Response('stale') });
    assert.equal(await online.fetch(request), network);
    assert.equal(online.calls.match.length, 0);

    const cached = new Response('offline page');
    const offline = setup({ scope: 'https://site.example/blog/', network: new Error('offline'), cached });
    assert.equal(await offline.fetch(request), cached);
    assert.deepEqual(offline.calls.match, ['https://site.example/blog/erro/']);
  });
}

test('navigation without network or offline cache returns an explicit 503', async () => {
  const s = setup({ network: new Error('offline') });
  const response = await s.fetch({ mode: 'navigate' });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.equal(await response.text(), 'Offline');
});

test('HTTP errors are preserved instead of being disguised as an offline page', async () => {
  for (const status of [404, 500, 503]) {
    const response = new Response('server response', { status });
    const s = setup({ network: response, cached: new Response('offline') });
    assert.equal(await s.fetch({ mode: 'navigate' }), response);
    assert.equal(s.calls.match.length, 0);
  }
});

test('local assets use fresh network responses and fall back to the exact requested version', async () => {
  const fresh = new Response('new CSS');
  const online = setup({ network: fresh, cached: new Response('old CSS') });
  assert.equal(await online.fetch(), fresh);
  assert.equal(online.calls.match.length, 0);

  const cached = new Response('cached CSS');
  const offline = setup({ network: new Error('offline'), cached });
  const url = 'https://site.example/static/css/main.css?v=version-under-test';
  assert.equal(await offline.fetch({ url }), cached);
  assert.equal(offline.calls.match[0], offline.calls.fetch[0]);
  assert.equal(offline.calls.match[0].url, url);
});

test('an uncached offline asset returns a network error rather than HTML', async () => {
  const s = setup({ network: new Error('offline') });
  const response = await s.fetch();
  assert.equal(response.type, 'error');
  assert.equal(response.status, 0);
});

test('non-GET requests and external assets bypass interception', () => {
  const s = setup();
  for (const method of ['POST', 'PUT', 'DELETE', 'HEAD']) {
    assert.equal(s.fetch({ method, mode: 'navigate' }), undefined);
  }
  assert.equal(s.fetch({ url: 'https://api.example/data.json' }), undefined);
  assert.equal(s.calls.fetch.length, 0);
  assert.equal(s.calls.match.length, 0);
});
