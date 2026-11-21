const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const readline = require('node:readline');
const E = require('../../web/static/games/chess/engine.js');

test('WebAssembly distribuído executa UCI e encontra mate em um', { timeout: 20000 }, async () => {
    const child = spawn(process.execPath, [path.resolve(__dirname, '../../web/static/games/chess/stockfish/stockfish-17.1-lite-single-03e3232.js')]);
    const lines = readline.createInterface({ input: child.stdout });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    const game = E.createGame('6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1');
    try {
        await new Promise((resolve, reject) => {
            child.on('error', reject);
            child.on('exit', code => reject(new Error(`Engine exited ${code}: ${stderr}`)));
            lines.on('line', line => {
                if (line === 'uciok') child.stdin.write('setoption name Skill Level value 20\nsetoption name UCI_LimitStrength value false\nisready\n');
                if (line === 'readyok') child.stdin.write(game.uciPosition() + '\ngo movetime 300\n');
                if (line.startsWith('bestmove ')) {
                    try {
                        const move = line.split(' ')[1];
                        assert.ok(game.move({ from: E.parseSquare(move.slice(0, 2)), to: E.parseSquare(move.slice(2, 4)), promotion: move[4] }));
                        assert.equal(game.status().reason, 'checkmate');
                        resolve();
                    } catch (error) { reject(error); }
                }
            });
            child.stdin.write('uci\n');
        });
    } finally {
        lines.close();
        child.kill();
    }
});

test('histórico UCI preserva repetição, desfazer, roque e promoção', () => {
    const game = E.createGame();
    for (const [from, to] of [['g1','f3'], ['g8','f6'], ['f3','g1'], ['f6','g8']]) game.move({from:E.parseSquare(from), to:E.parseSquare(to)});
    assert.ok(game.uciPosition().endsWith(' moves g1f3 g8f6 f3g1 f6g8'));
    game.undo();
    assert.ok(game.uciPosition().endsWith(' moves g1f3 g8f6 f3g1'));
    const promotion = E.createGame('8/P6k/8/8/8/8/8/K7 w - - 0 1');
    promotion.move({from:E.parseSquare('a7'), to:E.parseSquare('a8'), promotion:'n'});
    assert.ok(promotion.uciPosition().endsWith(' moves a7a8n'));
    const castle = E.createGame('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    castle.move({from:E.parseSquare('e1'), to:E.parseSquare('g1')});
    assert.ok(castle.uciPosition().endsWith(' moves e1g1'));
});
