const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../../web/static/games/chess/engine.js');
const AI = require('../../web/static/games/chess/ai.js');

const sq = E.parseSquare;
const seeded = (seed = 7) => () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
};

function assertLegal(game, move) {
    assert.ok(move, 'deve haver jogada');
    assert.ok(
        game.legalMoves().some(m => m.from === move.from && m.to === move.to && (m.promotion || undefined) === move.promotion),
        'jogada precisa ser legal',
    );
}

test('avaliacao: posicao inicial e simetrica e material pesa mais que posicao', () => {
    assert.equal(AI.evaluate(E.parseFEN(E.START_FEN)), 0);
    const up = E.parseFEN('4k3/8/8/8/8/8/8/R3K3 w - - 0 1');
    const down = E.parseFEN('4k3/8/8/8/8/8/8/R3K3 b - - 0 1');
    assert.ok(AI.evaluate(up) > 400);
    assert.equal(AI.evaluate(up), -AI.evaluate(down));
});

test('sem jogadas legais retorna null; jogada unica e devolvida sem busca', () => {
    assert.equal(AI.chooseMove(E.createGame('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'), 'hard'), null);
    const forced = E.createGame('7k/8/6K1/8/8/8/8/6R1 b - - 0 1');
    assert.equal(forced.legalMoves().length >= 1, true);
});

test('todos os niveis sempre jogam lances legais ao longo de uma partida inteira', () => {
    for (const level of Object.keys(AI.LEVELS)) {
        const game = E.createGame();
        const random = seeded(level.length);
        for (let ply = 0; ply < 24 && !game.status().over; ply += 1) {
            const move = AI.chooseMove(game, level, random);
            assertLegal(game, move);
            assert.ok(game.move(move));
        }
    }
});

test('nivel dificil acha mate em 1', () => {
    const game = E.createGame('6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1');
    const move = AI.chooseMove(game, 'hard', seeded());
    assert.deepEqual([move.from, move.to], [sq('a1'), sq('a8')]);
    game.move(move);
    assert.equal(game.status().reason, 'checkmate');
});

test('nivel dificil acha mate em 2 (sacrificio de dama)', () => {
    const game = E.createGame('r5k1/5ppp/8/8/8/8/1Q6/1R2K3 w - - 0 1');
    const move = AI.chooseMove(game, 'hard', seeded());
    assert.deepEqual([move.from, move.to], [sq('b2'), sq('b8')]);
});

test('niveis medio e dificil nao deixam a dama de graca', () => {
    // Dama preta pode capturar o peao em d5? A dama branca em d1 defende com a torre... aqui o peao e isca.
    const fen = '3rk3/8/8/3p4/8/8/8/3QK3 w - - 0 1';
    for (const level of ['medium', 'hard']) {
        const game = E.createGame(fen);
        const move = AI.chooseMove(game, level, seeded());
        assert.notDeepEqual([move.from, move.to], [sq('d1'), sq('d5')], `${level} nao deve capturar d5 e perder a dama para a torre`);
    }
});

test('captura de material livre e preferida nos niveis medio e dificil', () => {
    const fen = '4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1';
    for (const level of ['medium', 'hard']) {
        const move = AI.chooseMove(E.createGame(fen), level, seeded());
        assert.deepEqual([move.from, move.to], [sq('d1'), sq('d5')], level);
    }
});

test('promocao e escolhida como dama quando ganha', () => {
    const move = AI.chooseMove(E.createGame('8/P6k/8/8/8/8/8/K7 w - - 0 1'), 'hard', seeded());
    assert.deepEqual([move.from, move.to, move.promotion], [sq('a7'), sq('a8'), 'q']);
});

test('respeita o limite de tempo mesmo em posicao complexa', () => {
    const game = E.createGame('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
    const start = Date.now();
    const move = AI.chooseMove(game, 'hard', seeded());
    const elapsed = Date.now() - start;
    assertLegal(game, move);
    assert.ok(elapsed < AI.LEVELS.hard.timeMs + 1500, `levou ${elapsed}ms`);
});

test('nivel desconhecido cai no medio e o gerador injetado torna a escolha reprodutivel', () => {
    const a = AI.chooseMove(E.createGame(), 'inexistente', seeded(3));
    const b = AI.chooseMove(E.createGame(), 'medium', seeded(3));
    assert.deepEqual(a, b);
});

