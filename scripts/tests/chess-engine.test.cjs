const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../../web/static/games/chess/engine.js');

const fen = (text) => E.parseFEN(text);
const sq = E.parseSquare;

// Valores de referencia publicos (chessprogramming.org/Perft_Results).
const PERFT = [
    { name: 'posicao inicial', fen: E.START_FEN, nodes: [20, 400, 8902, 197281] },
    { name: 'kiwipete', fen: 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', nodes: [48, 2039, 97862] },
    { name: 'posicao 3 (en passant e xeques descobertos)', fen: '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', nodes: [14, 191, 2812, 43238] },
    { name: 'posicao 4 (promocoes e roque)', fen: 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', nodes: [6, 264, 9467] },
    { name: 'posicao 5', fen: 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', nodes: [44, 1486, 62379] },
    { name: 'posicao 6', fen: 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10', nodes: [46, 2079, 89890] },
];

for (const { name, fen: start, nodes } of PERFT) {
    test(`perft: ${name}`, () => {
        const pos = fen(start);
        nodes.forEach((expected, index) => {
            assert.equal(E.perft(pos, index + 1), expected, `profundidade ${index + 1}`);
        });
    });
}

test('FEN: leitura e escrita sao inversas', () => {
    for (const { fen: text } of PERFT) {
        assert.equal(E.toFEN(fen(text)), text);
    }
});

test('FEN: entradas invalidas sao rejeitadas', () => {
    for (const bad of ['', 'x', '8/8/8/8/8/8/8 w - - 0 1', '9/8/8/8/8/8/8/8 w - - 0 1', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR x KQkq - 0 1', '8/8/8/8/8/8/8/8 w - - 0 1', '8/8/8/8/8/8/8/K6X w - - 0 1']) {
        assert.throws(() => E.parseFEN(bad), bad);
    }
});

test('FEN: roque sem rei ou torre na origem e descartado', () => {
    const pos = fen('4k3/8/8/8/8/8/8/4K3 w KQkq - 0 1');
    assert.deepEqual(pos.castling, { K: false, Q: false, k: false, q: false });
});

test('mate do pastor termina em xeque-mate das brancas', () => {
    const game = E.createGame();
    for (const [from, to] of [['e2', 'e4'], ['e7', 'e5'], ['d1', 'h5'], ['b8', 'c6'], ['f1', 'c4'], ['g8', 'f6'], ['h5', 'f7']]) {
        assert.ok(game.move({ from: sq(from), to: sq(to) }), `${from}${to}`);
    }
    const status = game.status();
    assert.equal(status.over, true);
    assert.equal(status.reason, 'checkmate');
    assert.equal(status.winner, 'w');
    assert.equal(game.history().at(-1), 'Qxf7#');
});

test('mate do louco termina em xeque-mate das pretas', () => {
    const game = E.createGame();
    for (const [from, to] of [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4']]) {
        assert.ok(game.move({ from: sq(from), to: sq(to) }));
    }
    assert.deepEqual([game.status().reason, game.status().winner], ['checkmate', 'b']);
});

test('afogamento e empate sem vencedor', () => {
    const game = E.createGame('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    const status = game.status();
    assert.deepEqual([status.over, status.reason, status.winner, status.check], [true, 'stalemate', null, false]);
});

test('jogada ilegal e rejeitada e nao altera a posicao', () => {
    const game = E.createGame();
    const before = game.fen();
    assert.equal(game.move({ from: sq('e2'), to: sq('e5') }), null);
    assert.equal(game.move({ from: sq('e7'), to: sq('e5') }), null, 'pecas do adversario');
    assert.equal(game.move({ from: sq('a1'), to: sq('a3') }), null, 'torre bloqueada');
    assert.equal(game.move(null), null);
    assert.equal(game.fen(), before);
});

test('peca cravada nao pode sair da linha do rei', () => {
    const game = E.createGame('4r1k1/8/8/8/8/8/4B3/4K3 w - - 0 1');
    assert.equal(game.movesFrom(sq('e2')).length, 0);
});

test('em xeque so as respostas que resolvem o xeque sao legais', () => {
    const game = E.createGame('4k3/8/8/8/8/8/4r3/R3K3 w - - 0 1');
    assert.equal(game.status().check, true);
    for (const move of game.legalMoves()) {
        const next = E.applyMove(game.position, move);
        assert.equal(E.isAttacked(next.board, next.board.indexOf('K'), 'b'), false);
    }
});

test('roque: curto e longo movem rei e torre', () => {
    const short = E.createGame('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    short.move({ from: sq('e1'), to: sq('g1') });
    assert.equal(short.fen(), 'r3k2r/8/8/8/8/8/8/R4RK1 b kq - 1 1');
    assert.equal(short.history()[0], 'O-O');

    const long = E.createGame('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1');
    long.move({ from: sq('e8'), to: sq('c8') });
    assert.equal(long.fen(), '2kr3r/8/8/8/8/8/8/R3K2R w KQ - 1 2');
    assert.equal(long.history()[0], 'O-O-O');
});

test('roque e proibido: em xeque, atravessando casa atacada e apos mover a torre', () => {
    const inCheckNow = E.createGame('4r1k1/8/8/8/8/8/8/R3K2R w KQ - 0 1');
    assert.equal(inCheckNow.movesFrom(sq('e1')).some((move) => move.castle), false);

    const crossing = E.createGame('5rk1/8/8/8/8/8/8/R3K2R w KQ - 0 1');
    assert.equal(crossing.movesFrom(sq('e1')).some((move) => move.castle === 'K'), false);
    assert.equal(crossing.movesFrom(sq('e1')).some((move) => move.castle === 'Q'), true);

    const moved = E.createGame('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1');
    moved.move({ from: sq('h1'), to: sq('h2') });
    moved.move({ from: sq('e8'), to: sq('d8') });
    moved.move({ from: sq('h2'), to: sq('h1') });
    moved.move({ from: sq('d8'), to: sq('e8') });
    assert.equal(moved.movesFrom(sq('e1')).some((move) => move.castle === 'K'), false);
    assert.equal(moved.movesFrom(sq('e1')).some((move) => move.castle === 'Q'), true);
});

test('capturar a torre na origem remove o direito de roque do adversario', () => {
    const game = E.createGame('r3k2r/6B1/8/8/8/8/8/4K3 w kq - 0 1');
    game.move({ from: sq('g7'), to: sq('h8') });
    assert.equal(game.position.castling.k, false);
    assert.equal(game.position.castling.q, true);
});

test('en passant: so imediatamente, e remove o peao capturado', () => {
    const game = E.createGame();
    game.move({ from: sq('e2'), to: sq('e4') });
    game.move({ from: sq('a7'), to: sq('a6') });
    game.move({ from: sq('e4'), to: sq('e5') });
    game.move({ from: sq('d7'), to: sq('d5') });
    assert.ok(game.movesFrom(sq('e5')).some((move) => move.ep));
    game.move({ from: sq('e5'), to: sq('d6') });
    assert.equal(game.position.board[sq('d5')], null);
    assert.equal(game.position.board[sq('d6')], 'P');
    assert.equal(game.history().at(-1), 'exd6');

    const late = E.createGame();
    for (const [from, to] of [['e2', 'e4'], ['a7', 'a6'], ['e4', 'e5'], ['d7', 'd5'], ['h2', 'h3'], ['h7', 'h6']]) {
        late.move({ from: sq(from), to: sq(to) });
    }
    assert.equal(late.movesFrom(sq('e5')).some((move) => move.ep), false);
});

test('promocao: escolha da peca, padrao dama e notacao', () => {
    const base = '8/P6k/8/8/8/8/8/K7 w - - 0 1';
    const auto = E.createGame(base);
    assert.equal(auto.movesFrom(sq('a7')).length, 4);
    auto.move({ from: sq('a7'), to: sq('a8') });
    assert.equal(auto.position.board[sq('a8')], 'Q');

    const knight = E.createGame(base);
    const done = knight.move({ from: sq('a7'), to: sq('a8'), promotion: 'n' });
    assert.equal(knight.position.board[sq('a8')], 'N');
    assert.equal(done.san, 'a8=N');

    assert.equal(E.createGame(base).move({ from: sq('a7'), to: sq('a8'), promotion: 'k' }), null);
});

test('notacao: desambiguacao de pecas, captura e xeque', () => {
    const files = E.createGame('4k3/8/8/8/8/8/4K3/R6R w - - 0 1');
    assert.equal(files.move({ from: sq('a1'), to: sq('d1') }).san, 'Rad1');
    assert.equal(E.createGame('4k3/8/8/8/8/8/8/R3K3 w - - 0 1').move({ from: sq('a1'), to: sq('d1') }).san, 'Rd1');

    const ranks = E.createGame('R3k3/8/8/8/8/8/8/R3K3 w - - 0 1');
    assert.equal(ranks.move({ from: sq('a8'), to: sq('a5') }).san, 'R8a5');

    const capture = E.createGame('3k4/8/8/3p4/8/8/8/3QK3 w - - 0 1');
    assert.equal(capture.move({ from: sq('d1'), to: sq('d5') }).san, 'Qxd5+');
});

test('desfazer restaura posicao, turno e historico; nada a desfazer no inicio', () => {
    const game = E.createGame();
    assert.equal(game.undo(), false);
    assert.equal(game.canUndo(), false);
    game.move({ from: sq('e2'), to: sq('e4') });
    game.move({ from: sq('e7'), to: sq('e5') });
    assert.equal(game.canUndo(), true);
    assert.equal(game.undo(), true);
    assert.equal(game.turn, 'b');
    assert.deepEqual(game.history(), ['e4']);
    game.undo();
    assert.equal(game.fen(), E.START_FEN);
});

test('material insuficiente: casos de empate e casos que seguem', () => {
    const draws = [
        '8/8/8/4k3/8/8/8/4K3 w - - 0 1',
        '8/8/8/4k3/8/8/8/3NK3 w - - 0 1',
        '8/8/8/4k3/8/8/8/3BK3 w - - 0 1',
        '8/8/8/3bk3/8/8/8/3BK3 w - - 0 1',
    ];
    for (const text of draws) {
        assert.equal(E.createGame(text).status().reason, 'insufficient', text);
    }
    const plays = [
        '8/8/8/4k3/8/8/8/2NNK3 w - - 0 1',
        '8/8/8/2b1k3/8/8/8/3BK3 w - - 0 1',
        '8/8/8/4k3/8/8/4P3/4K3 w - - 0 1',
        '8/8/8/4k3/8/8/8/3RK3 w - - 0 1',
    ];
    for (const text of plays) {
        assert.equal(E.createGame(text).status().over, false, text);
    }
});

test('repeticao tripla e regra dos 50 lances', () => {
    const game = E.createGame('4k3/8/8/8/8/8/8/R3K3 w - - 0 1');
    const cycle = [['a1', 'a2'], ['e8', 'd8'], ['a2', 'a1'], ['d8', 'e8']];
    for (let round = 0; round < 2; round += 1) {
        assert.equal(game.status().over, false);
        for (const [from, to] of cycle) {
            game.move({ from: sq(from), to: sq(to) });
        }
    }
    assert.equal(game.status().reason, 'repetition');

    assert.equal(E.createGame('4k3/8/8/8/8/8/8/R3K3 w - - 100 80').status().reason, 'fifty');
    assert.equal(E.createGame('4k3/8/8/8/8/8/8/R3K3 w - - 99 80').status().over, false);
});

test('a posicao original nunca e alterada por applyMove', () => {
    const pos = fen(E.START_FEN);
    const before = E.toFEN(pos);
    for (const move of E.legalMoves(pos)) {
        E.applyMove(pos, move);
    }
    assert.equal(E.toFEN(pos), before);
});

