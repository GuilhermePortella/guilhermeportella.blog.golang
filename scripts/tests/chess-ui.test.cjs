const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../../web/static/games/chess/engine.js');
const AI = require('../../web/static/games/chess/ai.js');
const UI = require('../../web/static/games/chess/ui.js');

const sq = E.parseSquare;

class Element {
    constructor(tag = 'div') {
        this.tag = tag;
        this.children = [];
        this.handlers = {};
        this.attrs = {};
        this.className = '';
        this.hidden = false;
        this.disabled = false;
        this.value = '';
        this._text = '';
        this.scrollHeight = 0;
        this.scrollTop = 0;
    }
    set textContent(value) { this._text = String(value); this.children = []; }
    get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
    append(...nodes) { this.children.push(...nodes); }
    setAttribute(name, value) { this.attrs[name] = String(value); }
    getAttribute(name) { return name in this.attrs ? this.attrs[name] : null; }
    removeAttribute(name) { delete this.attrs[name]; }
    addEventListener(type, handler) { (this.handlers[type] ||= []).push(handler); }
    focus() { Element.focused = this; }
    emit(type, props = {}) {
        const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...props };
        (this.handlers[type] || []).forEach(handler => handler(event));
        return event;
    }
    click() { if (!this.disabled) this.emit('click'); }
}

function build() {
    const board = new Element();
    const promoteButtons = ['q', 'r', 'b', 'n'].map(piece => {
        const button = new Element('button');
        button.attrs['data-chess-promote'] = piece;
        return button;
    });
    const parts = {
        '[data-chess-board]': board,
        '[data-chess-turn]': new Element(),
        '[data-chess-message]': new Element(),
        '[data-chess-moves]': new Element('ol'),
        '[data-chess-record]': new Element(),
        '[data-chess-mode]': Object.assign(new Element('select'), { value: 'machine' }),
        '[data-chess-side]': Object.assign(new Element('select'), { value: 'w' }),
        '[data-chess-level]': Object.assign(new Element('select'), { value: 'medium' }),
        '[data-chess-new]': new Element('button'),
        '[data-chess-undo]': new Element('button'),
        '[data-chess-flip]': new Element('button'),
        '[data-chess-promotion]': new Element(),
    };
    const root = new Element();
    root.attrs['data-chess-worker-url'] = '/static/games/chess/worker.js?v=test';
    root.querySelector = selector => parts[selector] || null;
    root.querySelectorAll = selector => (selector === '[data-chess-promote]' ? promoteButtons : []);
    return { root, parts, promoteButtons };
}

function setup({ stored = null, worker = false, level } = {}) {
    const { root, parts, promoteButtons } = build();
    const store = new Map(stored === null ? [] : [[UI.STORAGE_KEY, stored]]);
    const storage = {
        getItem: key => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => store.set(key, value),
    };
    const timers = [];
    const workers = [];
    const deps = {
        document: { createElement: tag => new Element(tag) },
        engine: E,
        ai: AI,
        storage,
        minDelay: 0,
        now: () => 0,
        setTimeout: (fn) => { timers.push(fn); return timers.length; },
        clearTimeout: (id) => { timers[id - 1] = null; },
        createWorker: worker ? (url) => {
            const instance = { url, posted: [], terminated: false, postMessage(m) { this.posted.push(m); }, terminate() { this.terminated = true; } };
            workers.push(instance);
            return instance;
        } : null,
    };
    const app = UI.init(root, deps);
    if (level) parts['[data-chess-level]'].value = level;
    const flush = () => {
        while (timers.some(Boolean)) {
            const fn = timers.find(Boolean);
            timers[timers.indexOf(fn)] = null;
            fn();
        }
    };
    const squares = () => parts['[data-chess-board]'].children;
    return { app, parts, promoteButtons, store, timers, workers, flush, squares, message: () => parts['[data-chess-message]'].textContent };
}

// Posicao de tela para a casa "e2" etc., com o tabuleiro na orientacao das brancas.
const at = name => sq(name);

test('monta 64 casas acessiveis e valida elementos obrigatorios', () => {
    const { squares, message } = setup();
    assert.equal(squares().length, 64);
    assert.equal(squares()[at('e2')].getAttribute('aria-label'), 'e2, peão branco');
    assert.equal(squares()[at('e4')].getAttribute('aria-label'), 'e4, vazia');
    assert.equal(squares()[at('d8')].getAttribute('aria-label'), 'd8, dama preta');
    assert.equal(squares().filter(s => s.getAttribute('tabindex') === '0').length, 1, 'roving tabindex');
    assert.match(message(), /Sua vez/);

    const { root } = build();
    root.querySelector = () => null;
    assert.equal(UI.init(root, { document: { createElement: () => new Element() }, engine: E, ai: AI }), null);
});

test('selecionar mostra destinos e capturas; clicar em outra peca troca a selecao', () => {
    const { app, squares } = setup({ stored: JSON.stringify({ mode: 'local' }) });
    app.click(at('g1'));
    assert.match(squares()[at('g1')].className, /is-selected/);
    assert.match(squares()[at('f3')].className, /is-target/);
    assert.match(squares()[at('f3')].getAttribute('aria-label'), /destino possível/);
    app.click(at('b1'));
    assert.doesNotMatch(squares()[at('g1')].className, /is-selected/);
    assert.match(squares()[at('b1')].className, /is-selected/);
    app.click(at('e4'));
    assert.doesNotMatch(squares()[at('b1')].className, /is-selected/);
});

test('modo local alterna turnos e nao permite mexer em pecas do adversario', () => {
    const { app, squares, parts } = setup({ stored: JSON.stringify({ mode: 'local' }) });
    app.click(at('e7'));
    assert.doesNotMatch(squares()[at('e7')].className, /is-selected/);
    app.click(at('e2')); app.click(at('e4'));
    assert.equal(parts['[data-chess-turn]'].textContent, 'Pretas');
    assert.equal(squares()[at('e4')].getAttribute('aria-label'), 'e4, peão branco');
    app.click(at('e7')); app.click(at('e5'));
    assert.equal(parts['[data-chess-turn]'].textContent, 'Brancas');
    assert.equal(parts['[data-chess-moves]'].children.length, 1);
    assert.equal(parts['[data-chess-moves]'].children[0].textContent, 'e4  e5');
});

test('contra a maquina: jogada humana dispara a resposta e ela e aplicada', () => {
    const { app, flush, parts, squares } = setup({ stored: JSON.stringify({ level: 'easy' }) });
    app.click(at('e2')); app.click(at('e4'));
    assert.equal(parts['[data-chess-board]'].getAttribute('aria-busy'), 'true');
    app.click(at('d2'));
    assert.doesNotMatch(squares()[at('d2')].className, /is-selected/, 'bloqueado enquanto a maquina pensa');
    flush();
    assert.equal(parts['[data-chess-board]'].getAttribute('aria-busy'), 'false');
    assert.equal(app.state.game.turn, 'w');
    assert.equal(app.state.game.history().length, 2);
});

test('jogando de pretas, a maquina abre a partida e o tabuleiro vem girado', () => {
    const { app, flush, squares } = setup({ stored: JSON.stringify({ side: 'b', level: 'easy' }) });
    flush();
    assert.equal(app.state.game.history().length, 1);
    assert.equal(app.state.orientation, 'b');
    // Com a orientacao das pretas a casa a1 (indice 56) fica na posicao de tela 7.
    assert.equal(squares()[7].getAttribute('aria-label').slice(0, 2), 'a1');
    assert.equal(squares()[0].getAttribute('aria-label').slice(0, 2), 'h1');
    assert.equal(squares()[63].getAttribute('aria-label').slice(0, 2), 'a8');
});

test('desfazer contra a maquina devolve a vez ao humano (desfaz o par)', () => {
    const { app, flush, parts } = setup({ stored: JSON.stringify({ level: 'easy' }) });
    app.click(at('e2')); app.click(at('e4'));
    flush();
    assert.equal(parts['[data-chess-undo]'].disabled, false);
    parts['[data-chess-undo]'].click();
    flush();
    assert.equal(app.state.game.fen(), E.START_FEN);
    assert.equal(parts['[data-chess-undo]'].disabled, true);
});

test('desfazer enquanto a maquina pensa cancela a resposta pendente', () => {
    const { app, flush, parts } = setup({ stored: JSON.stringify({ level: 'easy' }) });
    app.click(at('e2')); app.click(at('e4'));
    parts['[data-chess-undo]'].click();
    flush();
    assert.equal(app.state.game.history().length, 0);
    assert.equal(app.state.game.turn, 'w');
});

test('promocao: abre o seletor, aceita a escolha e Esc cancela', () => {
    const { app, parts, promoteButtons, squares } = setup({ stored: JSON.stringify({ mode: 'local' }) });
    app.state.game = E.createGame('8/P6k/8/8/8/8/8/K7 w - - 0 1');
    app.click(at('a7')); app.click(at('a8'));
    assert.equal(parts['[data-chess-promotion]'].hidden, false);
    assert.match(parts['[data-chess-message]'].textContent, /promoção/);
    assert.equal(app.state.game.history().length, 0, 'nada acontece antes da escolha');

    squares()[at('e4')].emit('keydown', { key: 'Escape', preventDefault() {} });
    assert.equal(parts['[data-chess-promotion]'].hidden, true);
    assert.match(squares()[at('a7')].className, /is-selected/, 'a selecao e mantida apos cancelar');

    app.click(at('a8'));
    assert.equal(parts['[data-chess-promotion]'].hidden, false);
    promoteButtons.find(b => b.getAttribute('data-chess-promote') === 'n').click();
    assert.equal(parts['[data-chess-promotion]'].hidden, true);
    assert.equal(app.state.game.history()[0], 'a8=N');
    assert.equal(app.state.game.position.board[at('a8')], 'N');
});

test('fim de partida: xeque-mate bloqueia o tabuleiro e registra a vitoria uma unica vez', () => {
    const { app, parts, store } = setup({ stored: JSON.stringify({ level: 'easy' }) });
    app.state.game = E.createGame('6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1');
    app.click(at('a1')); app.click(at('a8'));
    assert.match(parts['[data-chess-message]'].textContent, /Xeque-mate\. Brancas venceram/);
    assert.equal(parts['[data-chess-turn]'].textContent, '-');
    assert.equal(app.state.record.wins, 1);
    const saved = JSON.parse(store.get(UI.STORAGE_KEY));
    assert.equal(saved.record.wins, 1);
    app.click(at('e1'));
    assert.equal(app.state.record.wins, 1);
    assert.match(parts['[data-chess-record]'].textContent, /Você 1 · Máquina 0 · Empates 0/);
});

test('empate por afogamento conta como empate', () => {
    const { app, parts } = setup({ stored: JSON.stringify({ level: 'easy' }) });
    app.state.game = E.createGame('7k/8/5K2/8/8/8/8/6Q1 w - - 0 1');
    app.click(at('g1')); app.click(at('g6'));
    assert.match(parts['[data-chess-message]'].textContent, /afogamento/);
    assert.equal(app.state.record.draws, 1);
});

test('novo jogo reinicia a partida, usa as escolhas do formulario e persiste', () => {
    const { app, parts, flush, store } = setup({ stored: JSON.stringify({ mode: 'local' }) });
    app.click(at('e2')); app.click(at('e4'));
    parts['[data-chess-mode]'].value = 'machine';
    parts['[data-chess-side]'].value = 'b';
    parts['[data-chess-new]'].click();
    flush();
    assert.equal(app.state.mode, 'machine');
    assert.equal(app.state.human, 'b');
    assert.equal(app.state.game.history().length, 1, 'maquina (brancas) abriu a partida');
    const saved = JSON.parse(store.get(UI.STORAGE_KEY));
    assert.equal(saved.mode, 'machine');
    assert.equal(saved.side, 'b');
});

test('trocar modo no meio da partida so vale no proximo jogo', () => {
    const { app, parts } = setup({ stored: JSON.stringify({ mode: 'local' }) });
    app.click(at('e2')); app.click(at('e4'));
    parts['[data-chess-mode]'].value = 'machine';
    parts['[data-chess-mode]'].emit('change');
    assert.equal(app.state.mode, 'local');
    assert.match(parts['[data-chess-message]'].textContent, /próximo Novo jogo/);
    assert.equal(app.state.game.history().length, 1);
});

test('girar tabuleiro inverte a orientacao sem alterar a partida', () => {
    const { app, parts, squares } = setup({ stored: JSON.stringify({ mode: 'local' }) });
    const fen = app.state.game.fen();
    parts['[data-chess-flip]'].click();
    assert.equal(app.state.orientation, 'b');
    assert.equal(squares()[0].getAttribute('aria-label').slice(0, 2), 'h1');
    assert.equal(app.state.game.fen(), fen);
});

test('navegacao por teclado move o foco entre casas e respeita as bordas', () => {
    const { squares } = setup();
    Element.focused = null;
    const first = squares()[0];
    const ev = first.emit('keydown', { key: 'ArrowDown' });
    assert.equal(ev.defaultPrevented, true);
    assert.equal(Element.focused, squares()[8]);
    squares()[8].emit('keydown', { key: 'ArrowUp' });
    assert.equal(Element.focused, squares()[0]);
    Element.focused = null;
    first.emit('keydown', { key: 'ArrowLeft' });
    first.emit('keydown', { key: 'ArrowUp' });
    assert.equal(Element.focused, null);
    assert.equal(first.emit('keydown', { key: 'a' }).defaultPrevented, false);
});

test('preferencias corrompidas ou fora da lista caem no padrao', () => {
    for (const bad of ['', 'nao-json', '{"level":"god","mode":"x","side":"z","record":{"wins":-1,"losses":"1","draws":1e99}}', '[]', 'null']) {
        const prefs = UI.loadPrefs({ getItem: () => bad });
        assert.deepEqual(prefs, { level: 'medium', mode: 'machine', side: 'w', record: { wins: 0, losses: 0, draws: 0 } }, bad);
    }
    const prefs = UI.loadPrefs({ getItem: () => JSON.stringify({ level: 'hard', record: { wins: 3, losses: 2, draws: 1 } }) });
    assert.equal(prefs.level, 'hard');
    assert.deepEqual(prefs.record, { wins: 3, losses: 2, draws: 1 });
});

test('armazenamento indisponivel nao quebra a interface', () => {
    const { root } = build();
    const app = UI.init(root, {
        document: { createElement: tag => new Element(tag) }, engine: E, ai: AI,
        storage: { getItem() { throw Error('x'); }, setItem() { throw Error('x'); } },
    });
    assert.ok(app, 'a interface deve iniciar mesmo sem armazenamento');
    assert.equal(app.state.game.history().length, 0);
    assert.doesNotThrow(() => { app.click(at('e2')); app.click(at('e4')); });
});

test('com Worker: envia o FEN, aplica a resposta e ignora respostas atrasadas', () => {
    const { app, workers, flush } = setup({ worker: true, stored: JSON.stringify({ level: 'hard' }) });
    app.click(at('e2')); app.click(at('e4'));
    assert.equal(workers.length, 1);
    assert.equal(workers[0].url, '/static/games/chess/worker.js?v=test');
    const [request] = workers[0].posted;
    assert.equal(request.level, 'hard');
    assert.equal(request.fen, app.state.game.fen());

    workers[0].onmessage({ data: { id: request.id - 1, move: { from: sq('e7'), to: sq('e5') } } });
    flush();
    assert.equal(app.state.game.history().length, 1, 'resposta antiga e descartada');

    workers[0].onmessage({ data: { id: request.id, move: { from: sq('e7'), to: sq('e5') } } });
    flush();
    assert.equal(app.state.game.history().length, 2);
    assert.equal(app.state.game.history()[1], 'e5');
});

test('Worker com falha: a busca roda na thread principal e a partida continua', () => {
    const { app, workers, flush } = setup({ worker: true, stored: JSON.stringify({ level: 'easy' }) });
    app.click(at('e2')); app.click(at('e4'));
    workers[0].onerror({});
    flush();
    assert.equal(workers[0].terminated, true);
    assert.equal(app.state.game.history().length, 2);
    app.click(at('d2')); app.click(at('d4'));
    flush();
    assert.equal(workers.length, 1, 'nao tenta recriar o worker quebrado');
    assert.equal(app.state.game.history().length, 4);
});

test('Worker responde com erro: usa a thread principal', () => {
    const { app, workers, flush } = setup({ worker: true, stored: JSON.stringify({ level: 'easy' }) });
    app.click(at('e2')); app.click(at('e4'));
    workers[0].onmessage({ data: { id: workers[0].posted[0].id, error: 'falha na busca' } });
    flush();
    assert.equal(app.state.game.history().length, 2);
});

test('Worker move invalido: avisa o jogador em vez de travar', () => {
    const { app, workers, flush, message } = setup({ worker: true, stored: JSON.stringify({ level: 'easy' }) });
    app.click(at('e2')); app.click(at('e4'));
    workers[0].onmessage({ data: { id: workers[0].posted[0].id, move: { from: sq('a1'), to: sq('a8') } } });
    flush();
    assert.match(message(), /não encontrou uma jogada/);
    assert.equal(app.state.thinking, false);
});

test('novo jogo durante a busca encerra o worker e descarta a resposta', () => {
    const { app, workers, parts, flush } = setup({ worker: true, stored: JSON.stringify({ level: 'hard' }) });
    app.click(at('e2')); app.click(at('e4'));
    const stale = workers[0].posted[0];
    parts['[data-chess-new]'].click();
    assert.equal(workers[0].terminated, true);
    workers[0].onmessage?.({ data: { id: stale.id, move: { from: sq('e7'), to: sq('e5') } } });
    flush();
    assert.equal(app.state.game.history().length, 0);
});

test('o codigo da interface nunca usa innerHTML', () => {
    const raw = require('node:fs').readFileSync('web/static/games/chess/ui.js', 'utf8');
    const source = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/);
});

