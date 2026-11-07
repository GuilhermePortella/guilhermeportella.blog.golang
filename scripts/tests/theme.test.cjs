const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const source = readFileSync('web/static/js/theme.js', 'utf8');
const KEY = 'gp:theme:v1';

function setup({ stored = null, broken = false, readyState = 'complete', withSwitch = true } = {}) {
    let value = stored;
    const attrs = {};
    const events = {};
    const docEvents = {};
    class Button {
        constructor(theme) { this.theme = theme; this.pressed = null; this.handlers = {}; }
        getAttribute(name) { return name === 'data-theme-option' ? this.theme : null; }
        setAttribute(name, val) { if (name === 'aria-pressed') this.pressed = val; }
        addEventListener(name, fn) { this.handlers[name] = fn; }
        click() { this.handlers.click(); }
    }
    const buttons = ['light', 'gta', 'dark'].map(theme => new Button(theme));
    const group = { hidden: true, querySelectorAll: () => buttons };
    const root = {
        setAttribute: (name, val) => { attrs[name] = val; },
        toggleAttribute: (name, force) => { if (force) attrs[name] = ''; else delete attrs[name]; },
    };
    const document = {
        readyState,
        documentElement: root,
        querySelector: key => (key === '[data-theme-switch]' && withSwitch ? group : null),
        querySelectorAll: key => (key === '[data-theme-option]' && withSwitch ? buttons : []),
        addEventListener: (name, fn) => { docEvents[name] = fn; },
    };
    const window = { addEventListener: (name, fn) => { events[name] = fn; } };
    const localStorage = {
        getItem(key) { if (broken) throw Error('unavailable'); return key === KEY ? value : null; },
        setItem(key, val) { if (broken) throw Error('unavailable'); if (key === KEY) value = val; },
    };
    vm.runInNewContext(source, { window, document, localStorage });
    return { attrs, buttons, group, window, events, docEvents, stored: () => value, setStored: v => { value = v; } };
}

test('sem preferência salva usa o tema claro e não marca tema escuro', () => {
    const s = setup();
    assert.equal(s.attrs['data-theme'], 'light');
    assert.equal('data-dark' in s.attrs, false);
    assert.equal(s.window.siteTheme.get(), 'light');
});

test('restaura tema salvo e marca data-dark apenas nos temas escuros', () => {
    assert.equal(setup({ stored: 'gta' }).attrs['data-theme'], 'gta');
    assert.equal('data-dark' in setup({ stored: 'gta' }).attrs, true);
    assert.equal('data-dark' in setup({ stored: 'dark' }).attrs, true);
    assert.equal('data-dark' in setup({ stored: 'light' }).attrs, false);
});

test('valor adulterado ou desconhecido no armazenamento cai no tema padrão', () => {
    for (const bad of ['', 'neon', '"><script>', 'DARK', '__proto__', 'light ']) {
        const s = setup({ stored: bad });
        assert.equal(s.attrs['data-theme'], 'light', bad);
        assert.equal('data-dark' in s.attrs, false, bad);
    }
});

test('armazenamento indisponível não quebra: usa o padrão e a escolha vale na página', () => {
    const s = setup({ broken: true });
    assert.equal(s.attrs['data-theme'], 'light');
    assert.equal(s.window.siteTheme.set('dark'), true);
    assert.equal(s.attrs['data-theme'], 'dark');
    assert.equal(s.window.siteTheme.get(), 'dark');
});

test('set persiste a escolha, rejeita temas fora da lista e preserva o atual', () => {
    const s = setup();
    assert.equal(s.window.siteTheme.set('gta'), true);
    assert.equal(s.stored(), 'gta');
    assert.equal(s.window.siteTheme.set('neon'), false);
    assert.equal(s.window.siteTheme.set(undefined), false);
    assert.equal(s.attrs['data-theme'], 'gta');
    assert.equal(s.stored(), 'gta');
});

test('com o documento pronto, o switch é exibido e os botões refletem aria-pressed', () => {
    const s = setup({ stored: 'dark' });
    assert.equal(s.group.hidden, false);
    assert.deepEqual(s.buttons.map(b => b.pressed), ['false', 'false', 'true']);
});

test('clicar em um botão aplica o tema, persiste e atualiza aria-pressed', () => {
    const s = setup();
    s.buttons[1].click();
    assert.equal(s.attrs['data-theme'], 'gta');
    assert.equal(s.stored(), 'gta');
    assert.deepEqual(s.buttons.map(b => b.pressed), ['false', 'true', 'false']);
    s.buttons[0].click();
    assert.equal(s.attrs['data-theme'], 'light');
    assert.equal('data-dark' in s.attrs, false);
});

test('no head (documento carregando) aplica o tema imediatamente e monta o switch depois', () => {
    const s = setup({ stored: 'gta', readyState: 'loading' });
    assert.equal(s.attrs['data-theme'], 'gta');
    assert.equal(s.group.hidden, true);
    s.docEvents.DOMContentLoaded();
    assert.equal(s.group.hidden, false);
    assert.equal(s.buttons[1].pressed, 'true');
});

test('página sem switch não gera erro', () => {
    const s = setup({ stored: 'dark', withSwitch: false });
    assert.equal(s.attrs['data-theme'], 'dark');
});

test('mudança em outra aba sincroniza o tema; chaves alheias são ignoradas', () => {
    const s = setup();
    s.setStored('dark');
    s.events.storage({ key: KEY });
    assert.equal(s.attrs['data-theme'], 'dark');
    s.setStored('gta');
    s.events.storage({ key: 'outra-chave' });
    assert.equal(s.attrs['data-theme'], 'dark');
});

test('os temas expostos correspondem às opções do template do header', () => {
    const s = setup();
    const header = readFileSync('web/templates/partials/site_header.html', 'utf8');
    const options = [...header.matchAll(/data-theme-option="([^"]+)"/g)].map(m => m[1]);
    assert.deepEqual(options, [...s.window.siteTheme.themes]);
});

test('todo tema declarado tem um bloco de tokens em themes.css (exceto o padrão)', () => {
    const s = setup();
    const css = readFileSync('web/static/css/themes.css', 'utf8');
    for (const theme of s.window.siteTheme.themes.filter(t => t !== 'light')) {
        assert.ok(css.includes(`html[data-theme="${theme}"] {`), theme);
    }
});

