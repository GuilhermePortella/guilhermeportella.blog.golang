/*
 * IA do xadrez: negamax com poda alfa-beta, aprofundamento iterativo, busca de
 * quietude e avaliacao por material e tabelas de casas. Depende de engine.js.
 * Sem DOM, entao tambem roda em Web Worker.
 *
 * O limite de tempo e checado durante a busca; se estourar, vale o melhor lance
 * da ultima profundidade completa.
 */
(function (root, factory) {
  "use strict";

  const engine = typeof module === "object" && module.exports
    ? require("./engine.js")
    : root.ChessEngine;
  const api = factory(engine);

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.ChessAI = api;
  }
})(typeof self !== "undefined" ? self : this, function (E) {
  "use strict";

  const MATE = 100000;
  const INFINITY = 1000000;
  const VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

  // Tabelas na perspectiva das brancas, indice 0 = a8. Pretas espelham a linha.
  const PST = {
    p: [
      0, 0, 0, 0, 0, 0, 0, 0,
      50, 50, 50, 50, 50, 50, 50, 50,
      10, 10, 20, 30, 30, 20, 10, 10,
      5, 5, 10, 25, 25, 10, 5, 5,
      0, 0, 0, 20, 20, 0, 0, 0,
      5, -5, -10, 0, 0, -10, -5, 5,
      5, 10, 10, -20, -20, 10, 10, 5,
      0, 0, 0, 0, 0, 0, 0, 0,
    ],
    n: [
      -50, -40, -30, -30, -30, -30, -40, -50,
      -40, -20, 0, 0, 0, 0, -20, -40,
      -30, 0, 10, 15, 15, 10, 0, -30,
      -30, 5, 15, 20, 20, 15, 5, -30,
      -30, 0, 15, 20, 20, 15, 0, -30,
      -30, 5, 10, 15, 15, 10, 5, -30,
      -40, -20, 0, 5, 5, 0, -20, -40,
      -50, -40, -30, -30, -30, -30, -40, -50,
    ],
    b: [
      -20, -10, -10, -10, -10, -10, -10, -20,
      -10, 0, 0, 0, 0, 0, 0, -10,
      -10, 0, 5, 10, 10, 5, 0, -10,
      -10, 5, 5, 10, 10, 5, 5, -10,
      -10, 0, 10, 10, 10, 10, 0, -10,
      -10, 10, 10, 10, 10, 10, 10, -10,
      -10, 5, 0, 0, 0, 0, 5, -10,
      -20, -10, -10, -10, -10, -10, -10, -20,
    ],
    r: [
      0, 0, 0, 0, 0, 0, 0, 0,
      5, 10, 10, 10, 10, 10, 10, 5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      0, 0, 0, 5, 5, 0, 0, 0,
    ],
    q: [
      -20, -10, -10, -5, -5, -10, -10, -20,
      -10, 0, 0, 0, 0, 0, 0, -10,
      -10, 0, 5, 5, 5, 5, 0, -10,
      -5, 0, 5, 5, 5, 5, 0, -5,
      0, 0, 5, 5, 5, 5, 0, -5,
      -10, 5, 5, 5, 5, 5, 0, -10,
      -10, 0, 5, 0, 0, 0, 0, -10,
      -20, -10, -10, -5, -5, -10, -10, -20,
    ],
    kMid: [
      -30, -40, -40, -50, -50, -40, -40, -30,
      -30, -40, -40, -50, -50, -40, -40, -30,
      -30, -40, -40, -50, -50, -40, -40, -30,
      -30, -40, -40, -50, -50, -40, -40, -30,
      -20, -30, -30, -40, -40, -30, -30, -20,
      -10, -20, -20, -20, -20, -20, -20, -10,
      20, 20, 0, 0, 0, 0, 20, 20,
      20, 30, 10, 0, 0, 10, 30, 20,
    ],
    kEnd: [
      -50, -40, -30, -20, -20, -30, -40, -50,
      -30, -20, -10, 0, 0, -10, -20, -30,
      -30, -10, 20, 30, 30, 20, -10, -30,
      -30, -10, 30, 40, 40, 30, -10, -30,
      -30, -10, 30, 40, 40, 30, -10, -30,
      -30, -10, 20, 30, 30, 20, -10, -30,
      -30, -30, 0, 0, 0, 0, -30, -30,
      -50, -30, -30, -30, -30, -30, -30, -50,
    ],
  };

  // `noise` e `blunder` dao erros humanos nos niveis mais baixos.
  const LEVELS = {
    easy: { depth: 1, quiescence: false, noise: 90, blunder: 0.28, timeMs: 400 },
    medium: { depth: 2, quiescence: true, noise: 18, blunder: 0, timeMs: 900 },
    hard: { depth: 4, quiescence: true, noise: 0, blunder: 0, timeMs: 2200 },
  };

  const TIME_CHECK_MASK = 1023;

  class TimeUp extends Error {}

  function isEndgame(board) {
    let material = 0;
    for (const piece of board) {
      if (piece) {
        const type = piece.toLowerCase();
        if (type !== "k" && type !== "p") {
          material += VALUES[type];
        }
      }
    }
    return material <= 2600;
  }

  // Pontuacao do ponto de vista de quem joga (positivo = bom para o turno).
  function evaluate(pos) {
    const { board } = pos;
    const endgame = isEndgame(board);
    let score = 0;
    let whiteBishops = 0;
    let blackBishops = 0;

    for (let index = 0; index < 64; index += 1) {
      const piece = board[index];
      if (!piece) {
        continue;
      }

      const white = piece < "a";
      const type = piece.toLowerCase();
      const table = type === "k" ? (endgame ? PST.kEnd : PST.kMid) : PST[type];
      const square = white ? index : (7 - (index >> 3)) * 8 + (index & 7);
      const value = VALUES[type] + table[square];

      score += white ? value : -value;
      if (type === "b") {
        if (white) {
          whiteBishops += 1;
        } else {
          blackBishops += 1;
        }
      }
    }

    if (whiteBishops >= 2) {
      score += 30;
    }
    if (blackBishops >= 2) {
      score -= 30;
    }

    return pos.turn === "w" ? score : -score;
  }

  // Capturas de maior valor primeiro; promocoes logo depois.
  function orderEntries(entries, preferred) {
    const scored = entries.map((entry) => {
      const { move } = entry;
      let score = 0;
      if (preferred && move.from === preferred.from && move.to === preferred.to && move.promotion === preferred.promotion) {
        score += 1000000;
      }
      if (move.captured) {
        score += 10 * VALUES[move.captured.toLowerCase()] - VALUES[move.piece.toLowerCase()] + 10000;
      }
      if (move.promotion) {
        score += VALUES[move.promotion] + 9000;
      }
      return { entry, score };
    });

    scored.sort((left, right) => right.score - left.score);
    return scored.map((item) => item.entry);
  }

  function createSearch(options) {
    const deadline = Date.now() + options.timeMs;
    let nodes = 0;

    function checkTime() {
      nodes += 1;
      if ((nodes & TIME_CHECK_MASK) === 0 && Date.now() > deadline) {
        throw new TimeUp();
      }
    }

    function quiescence(pos, alpha, beta) {
      checkTime();

      const standPat = evaluate(pos);
      if (standPat >= beta) {
        return standPat;
      }
      let best = standPat;
      alpha = Math.max(alpha, standPat);

      // So capturas: incluir promocoes sem captura faria a IA adiar a promocao
      // (efeito de horizonte), ganhando um tempo para o rei na tabela de casas.
      const tactical = E.legalEntries(pos).filter((entry) => entry.move.captured);
      for (const entry of orderEntries(tactical)) {
        const score = -quiescence(entry.next, -beta, -alpha);
        if (score > best) {
          best = score;
        }
        if (score > alpha) {
          alpha = score;
        }
        if (alpha >= beta) {
          break;
        }
      }

      return best;
    }

    function negamax(pos, depth, alpha, beta, ply, history) {
      checkTime();

      const key = E.positionKey(pos);
      if (ply > 0 && (pos.halfmove >= 100 || history.includes(key) || E.insufficientMaterial(pos.board))) {
        return 0;
      }

      const entries = E.legalEntries(pos);
      if (entries.length === 0) {
        return E.inCheck(pos) ? -MATE + ply : 0;
      }

      if (depth <= 0) {
        return options.quiescence ? quiescence(pos, alpha, beta) : evaluate(pos);
      }

      let best = -INFINITY;
      history.push(key);
      for (const entry of orderEntries(entries)) {
        const score = -negamax(entry.next, depth - 1, -beta, -alpha, ply + 1, history);
        if (score > best) {
          best = score;
        }
        if (score > alpha) {
          alpha = score;
        }
        if (alpha >= beta) {
          break;
        }
      }
      history.pop();

      return best;
    }

    function searchRoot(entries, depth, history, preferred) {
      let alpha = -INFINITY;
      const scored = [];

      history.push(E.positionKey(entries.root));
      for (const entry of orderEntries(entries.list, preferred)) {
        const score = -negamax(entry.next, depth - 1, -INFINITY, -alpha, 1, history);
        scored.push({ move: entry.move, score });
        if (score > alpha) {
          alpha = score;
        }
      }
      history.pop();

      scored.sort((left, right) => right.score - left.score);
      return scored;
    }

    return { searchRoot };
  }

  /*
   * Escolhe uma jogada para o jogador da vez. `game` e o objeto de
   * E.createGame; `random` (opcional) substitui Math.random nos testes.
   * Retorna { from, to, promotion } ou null quando nao ha jogada legal.
   */
  function chooseMove(game, level, random) {
    const profile = LEVELS[level] || LEVELS.medium;
    const rng = typeof random === "function" ? random : Math.random;
    const pos = game.position;
    const list = E.legalEntries(pos);

    if (list.length === 0) {
      return null;
    }
    if (list.length === 1) {
      return plain(list[0].move);
    }

    if (profile.blunder > 0 && rng() < profile.blunder) {
      return plain(list[Math.floor(rng() * list.length)].move);
    }

    const search = createSearch(profile);
    const entries = { root: pos, list };
    let ranked = null;
    let preferred = null;

    for (let depth = 1; depth <= profile.depth; depth += 1) {
      try {
        const result = search.searchRoot(entries, depth, [], preferred);
        ranked = result;
        preferred = result[0].move;
        if (result[0].score >= MATE - 100) {
          break;
        }
      } catch (error) {
        if (!(error instanceof TimeUp)) {
          throw error;
        }
        break;
      }
    }

    if (!ranked) {
      return plain(orderEntries(list)[0].move);
    }

    const best = ranked[0].score;
    const pool = ranked.filter((item) => profile.noise > 0 && best - item.score <= profile.noise);
    const chosen = pool.length > 1 ? pool[Math.floor(rng() * pool.length)] : ranked[0];

    return plain(chosen.move);
  }

  function plain(move) {
    return { from: move.from, to: move.to, promotion: move.promotion || undefined };
  }

  return { LEVELS, VALUES, evaluate, chooseMove };
});

