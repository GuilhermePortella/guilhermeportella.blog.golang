/*
 * Motor de regras do xadrez (sem DOM).
 *
 * Tabuleiro: array de 64 casas, indice = linha * 8 + coluna, com a linha 0 na
 * oitava fileira (a8 = 0, h1 = 63). Pecas seguem a notacao FEN: maiusculas
 * brancas, minusculas pretas; casa vazia = null.
 *
 * Funciona no navegador (window.ChessEngine), em Web Worker (self.ChessEngine)
 * e no Node (require).
 */
(function (root, factory) {
  "use strict";

  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.ChessEngine = api;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const FILES = "abcdefgh";
  const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const KNIGHT_STEPS = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  const KING_STEPS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const BISHOP_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const ROOK_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const QUEEN_DIRS = BISHOP_DIRS.concat(ROOK_DIRS);
  const PROMOTION_PIECES = ["q", "r", "b", "n"];
  const FIFTY_MOVE_PLIES = 100;

  // Casas de torre que perdem o direito de roque quando movidas ou capturadas.
  const ROOK_CORNERS = { 63: "K", 56: "Q", 7: "k", 0: "q" };

  function colorOf(piece) {
    if (!piece) {
      return null;
    }
    return piece < "a" ? "w" : "b";
  }

  function other(color) {
    return color === "w" ? "b" : "w";
  }

  function squareName(index) {
    return FILES[index & 7] + String(8 - (index >> 3));
  }

  function parseSquare(name) {
    const match = /^([a-h])([1-8])$/.exec(String(name));
    if (!match) {
      return -1;
    }
    return (8 - Number(match[2])) * 8 + FILES.indexOf(match[1]);
  }

  function inside(row, col) {
    return row >= 0 && row < 8 && col >= 0 && col < 8;
  }

  /* ------------------------------ FEN ------------------------------ */

  function parseFEN(fen) {
    const parts = String(fen).trim().split(/\s+/);
    if (parts.length < 4) {
      throw new Error("FEN invalido");
    }

    const rows = parts[0].split("/");
    if (rows.length !== 8) {
      throw new Error("FEN invalido: esperadas 8 fileiras");
    }

    const board = new Array(64).fill(null);
    rows.forEach((text, row) => {
      let col = 0;
      for (const char of text) {
        if (/[1-8]/.test(char)) {
          col += Number(char);
        } else if ("PNBRQKpnbrqk".includes(char) && col < 8) {
          board[row * 8 + col] = char;
          col += 1;
        } else {
          throw new Error("FEN invalido: peca desconhecida");
        }
      }
      if (col !== 8) {
        throw new Error("FEN invalido: fileira incompleta");
      }
    });

    if (board.filter((piece) => piece === "K").length !== 1 || board.filter((piece) => piece === "k").length !== 1) {
      throw new Error("FEN invalido: cada lado precisa de um rei");
    }

    const turn = parts[1];
    if (turn !== "w" && turn !== "b") {
      throw new Error("FEN invalido: turno");
    }

    // Direitos de roque so valem com rei e torre nas casas de origem.
    const rights = parts[2];
    const castling = {
      K: rights.includes("K") && board[60] === "K" && board[63] === "R",
      Q: rights.includes("Q") && board[60] === "K" && board[56] === "R",
      k: rights.includes("k") && board[4] === "k" && board[7] === "r",
      q: rights.includes("q") && board[4] === "k" && board[0] === "r",
    };

    let ep = -1;
    if (parts[3] !== "-") {
      ep = parseSquare(parts[3]);
      if (ep < 0) {
        throw new Error("FEN invalido: en passant");
      }
    }

    const halfmove = Number.parseInt(parts[4] || "0", 10);
    const fullmove = Number.parseInt(parts[5] || "1", 10);

    return {
      board,
      turn,
      castling,
      ep,
      halfmove: Number.isFinite(halfmove) && halfmove >= 0 ? halfmove : 0,
      fullmove: Number.isFinite(fullmove) && fullmove >= 1 ? fullmove : 1,
    };
  }

  function toFEN(pos) {
    const rows = [];
    for (let row = 0; row < 8; row += 1) {
      let text = "";
      let empty = 0;
      for (let col = 0; col < 8; col += 1) {
        const piece = pos.board[row * 8 + col];
        if (piece) {
          if (empty) {
            text += String(empty);
            empty = 0;
          }
          text += piece;
        } else {
          empty += 1;
        }
      }
      rows.push(empty ? text + String(empty) : text);
    }

    const { K, Q, k, q } = pos.castling;
    const rights = (K ? "K" : "") + (Q ? "Q" : "") + (k ? "k" : "") + (q ? "q" : "");
    const ep = pos.ep >= 0 ? squareName(pos.ep) : "-";

    return `${rows.join("/")} ${pos.turn} ${rights || "-"} ${ep} ${pos.halfmove} ${pos.fullmove}`;
  }

  /* ---------------------------- Ataques ---------------------------- */

  function isAttacked(board, target, by) {
    const row = target >> 3;
    const col = target & 7;

    const pawn = by === "w" ? "P" : "p";
    const pawnRow = by === "w" ? row + 1 : row - 1;
    if (pawnRow >= 0 && pawnRow < 8) {
      if (col > 0 && board[pawnRow * 8 + col - 1] === pawn) {
        return true;
      }
      if (col < 7 && board[pawnRow * 8 + col + 1] === pawn) {
        return true;
      }
    }

    const knight = by === "w" ? "N" : "n";
    for (const [dr, dc] of KNIGHT_STEPS) {
      const r = row + dr;
      const c = col + dc;
      if (inside(r, c) && board[r * 8 + c] === knight) {
        return true;
      }
    }

    const king = by === "w" ? "K" : "k";
    for (const [dr, dc] of KING_STEPS) {
      const r = row + dr;
      const c = col + dc;
      if (inside(r, c) && board[r * 8 + c] === king) {
        return true;
      }
    }

    const queen = by === "w" ? "Q" : "q";
    const bishop = by === "w" ? "B" : "b";
    const rook = by === "w" ? "R" : "r";

    for (const [dr, dc] of BISHOP_DIRS) {
      let r = row + dr;
      let c = col + dc;
      while (inside(r, c)) {
        const piece = board[r * 8 + c];
        if (piece) {
          if (piece === bishop || piece === queen) {
            return true;
          }
          break;
        }
        r += dr;
        c += dc;
      }
    }

    for (const [dr, dc] of ROOK_DIRS) {
      let r = row + dr;
      let c = col + dc;
      while (inside(r, c)) {
        const piece = board[r * 8 + c];
        if (piece) {
          if (piece === rook || piece === queen) {
            return true;
          }
          break;
        }
        r += dr;
        c += dc;
      }
    }

    return false;
  }

  function inCheck(pos) {
    const king = pos.turn === "w" ? "K" : "k";
    return isAttacked(pos.board, pos.board.indexOf(king), other(pos.turn));
  }

  /* ----------------------- Geracao de movimentos ----------------------- */

  function createMove(from, to, piece, captured, extra) {
    return Object.assign(
      { from, to, piece, captured: captured || null, promotion: null, ep: false, double: false, castle: null },
      extra,
    );
  }

  function stepMoves(board, turn, from, row, col, steps, moves) {
    const piece = board[from];
    for (const [dr, dc] of steps) {
      const r = row + dr;
      const c = col + dc;
      if (!inside(r, c)) {
        continue;
      }
      const target = board[r * 8 + c];
      if (!target || colorOf(target) !== turn) {
        moves.push(createMove(from, r * 8 + c, piece, target));
      }
    }
  }

  function slideMoves(board, turn, from, row, col, dirs, moves) {
    const piece = board[from];
    for (const [dr, dc] of dirs) {
      let r = row + dr;
      let c = col + dc;
      while (inside(r, c)) {
        const target = board[r * 8 + c];
        if (!target) {
          moves.push(createMove(from, r * 8 + c, piece, null));
        } else {
          if (colorOf(target) !== turn) {
            moves.push(createMove(from, r * 8 + c, piece, target));
          }
          break;
        }
        r += dr;
        c += dc;
      }
    }
  }

  function pushPawnMove(moves, from, to, piece, captured, targetRow, extra) {
    const lastRow = piece === "P" ? 0 : 7;
    if (targetRow === lastRow) {
      for (const promotion of PROMOTION_PIECES) {
        moves.push(createMove(from, to, piece, captured, Object.assign({ promotion }, extra)));
      }
      return;
    }
    moves.push(createMove(from, to, piece, captured, extra));
  }

  function pawnMoves(pos, from, row, col, moves) {
    const { board, turn } = pos;
    const piece = board[from];
    const dir = turn === "w" ? -1 : 1;
    const startRow = turn === "w" ? 6 : 1;
    const nextRow = row + dir;

    if (nextRow < 0 || nextRow > 7) {
      return;
    }

    const ahead = nextRow * 8 + col;
    if (!board[ahead]) {
      pushPawnMove(moves, from, ahead, piece, null, nextRow);
      const twoAhead = (row + 2 * dir) * 8 + col;
      if (row === startRow && !board[twoAhead]) {
        moves.push(createMove(from, twoAhead, piece, null, { double: true }));
      }
    }

    for (const dc of [-1, 1]) {
      const c = col + dc;
      if (c < 0 || c > 7) {
        continue;
      }
      const to = nextRow * 8 + c;
      const target = board[to];
      if (target && colorOf(target) !== turn) {
        pushPawnMove(moves, from, to, piece, target, nextRow);
      } else if (!target && to === pos.ep) {
        moves.push(createMove(from, to, piece, board[row * 8 + c], { ep: true }));
      }
    }
  }

  function castlingMoves(pos, moves) {
    const { board, turn, castling } = pos;
    const white = turn === "w";
    const base = white ? 56 : 0;
    const king = white ? "K" : "k";
    const rook = white ? "R" : "r";
    const enemy = other(turn);
    const kingSide = white ? castling.K : castling.k;
    const queenSide = white ? castling.Q : castling.q;

    if ((!kingSide && !queenSide) || board[base + 4] !== king || isAttacked(board, base + 4, enemy)) {
      return;
    }

    if (
      kingSide
      && board[base + 7] === rook
      && !board[base + 5]
      && !board[base + 6]
      && !isAttacked(board, base + 5, enemy)
      && !isAttacked(board, base + 6, enemy)
    ) {
      moves.push(createMove(base + 4, base + 6, king, null, { castle: "K" }));
    }

    if (
      queenSide
      && board[base] === rook
      && !board[base + 1]
      && !board[base + 2]
      && !board[base + 3]
      && !isAttacked(board, base + 3, enemy)
      && !isAttacked(board, base + 2, enemy)
    ) {
      moves.push(createMove(base + 4, base + 2, king, null, { castle: "Q" }));
    }
  }

  function pseudoMoves(pos) {
    const { board, turn } = pos;
    const moves = [];

    for (let from = 0; from < 64; from += 1) {
      const piece = board[from];
      if (!piece || colorOf(piece) !== turn) {
        continue;
      }

      const row = from >> 3;
      const col = from & 7;

      switch (piece.toLowerCase()) {
        case "p":
          pawnMoves(pos, from, row, col, moves);
          break;
        case "n":
          stepMoves(board, turn, from, row, col, KNIGHT_STEPS, moves);
          break;
        case "k":
          stepMoves(board, turn, from, row, col, KING_STEPS, moves);
          castlingMoves(pos, moves);
          break;
        case "b":
          slideMoves(board, turn, from, row, col, BISHOP_DIRS, moves);
          break;
        case "r":
          slideMoves(board, turn, from, row, col, ROOK_DIRS, moves);
          break;
        default:
          slideMoves(board, turn, from, row, col, QUEEN_DIRS, moves);
      }
    }

    return moves;
  }

  /* ----------------------------- Jogadas ----------------------------- */

  // Retorna uma nova posicao; a original nunca e alterada.
  function applyMove(pos, move) {
    const board = pos.board.slice();
    const mover = pos.turn;
    const piece = board[move.from];

    board[move.from] = null;

    if (move.ep) {
      board[(move.from >> 3) * 8 + (move.to & 7)] = null;
    }

    board[move.to] = move.promotion
      ? (mover === "w" ? move.promotion.toUpperCase() : move.promotion)
      : piece;

    if (move.castle) {
      const base = mover === "w" ? 56 : 0;
      const rook = mover === "w" ? "R" : "r";
      if (move.castle === "K") {
        board[base + 7] = null;
        board[base + 5] = rook;
      } else {
        board[base] = null;
        board[base + 3] = rook;
      }
    }

    const castling = Object.assign({}, pos.castling);
    if (piece === "K") {
      castling.K = false;
      castling.Q = false;
    } else if (piece === "k") {
      castling.k = false;
      castling.q = false;
    }
    for (const square of [move.from, move.to]) {
      const flag = ROOK_CORNERS[square];
      if (flag) {
        castling[flag] = false;
      }
    }

    return {
      board,
      turn: other(mover),
      castling,
      ep: move.double ? (move.from + move.to) >> 1 : -1,
      halfmove: piece.toLowerCase() === "p" || move.captured ? 0 : pos.halfmove + 1,
      fullmove: pos.fullmove + (mover === "b" ? 1 : 0),
    };
  }

  // Lista de { move, next } apenas com jogadas legais (rei nunca fica em xeque).
  function legalEntries(pos) {
    const king = pos.turn === "w" ? "K" : "k";
    const enemy = other(pos.turn);
    const entries = [];

    for (const move of pseudoMoves(pos)) {
      const next = applyMove(pos, move);
      if (!isAttacked(next.board, next.board.indexOf(king), enemy)) {
        entries.push({ move, next });
      }
    }

    return entries;
  }

  function legalMoves(pos) {
    return legalEntries(pos).map((entry) => entry.move);
  }

  function perft(pos, depth) {
    if (depth === 0) {
      return 1;
    }
    const entries = legalEntries(pos);
    if (depth === 1) {
      return entries.length;
    }
    let total = 0;
    for (const entry of entries) {
      total += perft(entry.next, depth - 1);
    }
    return total;
  }

  /* ------------------------ Notacao e resultado ------------------------ */

  function toSAN(pos, move, entries) {
    let text;

    if (move.castle) {
      text = move.castle === "K" ? "O-O" : "O-O-O";
    } else {
      const type = move.piece.toUpperCase();
      const target = squareName(move.to);
      const capture = move.captured ? "x" : "";

      if (type === "P") {
        text = (move.captured ? FILES[move.from & 7] + capture : "") + target;
        if (move.promotion) {
          text += "=" + move.promotion.toUpperCase();
        }
      } else {
        const rivals = entries
          .map((entry) => entry.move)
          .filter((rival) => rival.piece === move.piece && rival.to === move.to && rival.from !== move.from);
        let hint = "";
        if (rivals.length) {
          const sameFile = rivals.some((rival) => (rival.from & 7) === (move.from & 7));
          const sameRank = rivals.some((rival) => (rival.from >> 3) === (move.from >> 3));
          if (!sameFile) {
            hint = FILES[move.from & 7];
          } else if (!sameRank) {
            hint = String(8 - (move.from >> 3));
          } else {
            hint = squareName(move.from);
          }
        }
        text = type + hint + capture + target;
      }
    }

    const next = applyMove(pos, move);
    if (inCheck(next)) {
      text += legalEntries(next).length === 0 ? "#" : "+";
    }

    return text;
  }

  function insufficientMaterial(board) {
    const remaining = [];
    board.forEach((piece, index) => {
      if (piece && piece.toLowerCase() !== "k") {
        remaining.push({ type: piece.toLowerCase(), index });
      }
    });

    if (remaining.length === 0) {
      return true;
    }
    if (remaining.length === 1) {
      return remaining[0].type === "n" || remaining[0].type === "b";
    }
    if (remaining.every((item) => item.type === "b")) {
      const shade = (item) => ((item.index >> 3) + (item.index & 7)) % 2;
      return remaining.every((item) => shade(item) === shade(remaining[0]));
    }
    return false;
  }

  // O en passant so entra na chave quando existe um peao capaz de executa-lo.
  function positionKey(pos) {
    let ep = -1;
    if (pos.ep >= 0) {
      const pawn = pos.turn === "w" ? "P" : "p";
      const pawnRow = (pos.ep >> 3) + (pos.turn === "w" ? 1 : -1);
      const col = pos.ep & 7;
      if ((col > 0 && pos.board[pawnRow * 8 + col - 1] === pawn) || (col < 7 && pos.board[pawnRow * 8 + col + 1] === pawn)) {
        ep = pos.ep;
      }
    }

    const { K, Q, k, q } = pos.castling;
    const placement = pos.board.map((piece) => piece || "-").join("");
    return `${placement} ${pos.turn} ${K ? "K" : ""}${Q ? "Q" : ""}${k ? "k" : ""}${q ? "q" : ""} ${ep}`;
  }

  /* ------------------------------ Partida ------------------------------ */

  function createGame(fen) {
    const stack = [createNode(parseFEN(fen || START_FEN), null, "")];

    function createNode(pos, move, san) {
      return { pos, move, san, key: positionKey(pos), entries: null };
    }

    function top() {
      return stack[stack.length - 1];
    }

    function entriesOf(node) {
      if (!node.entries) {
        node.entries = legalEntries(node.pos);
      }
      return node.entries;
    }

    function move(input) {
      if (!input) {
        return null;
      }

      const node = top();
      const candidates = entriesOf(node).filter((entry) => entry.move.from === input.from && entry.move.to === input.to);
      if (!candidates.length) {
        return null;
      }

      let chosen = candidates[0];
      if (chosen.move.promotion) {
        const wanted = String(input.promotion || "q").toLowerCase();
        chosen = candidates.find((entry) => entry.move.promotion === wanted);
        if (!chosen) {
          return null;
        }
      }

      const san = toSAN(node.pos, chosen.move, node.entries);
      stack.push(createNode(chosen.next, chosen.move, san));
      return Object.assign({}, chosen.move, { san });
    }

    function undo() {
      if (stack.length <= 1) {
        return false;
      }
      stack.pop();
      return true;
    }

    function status() {
      const node = top();
      const check = inCheck(node.pos);

      if (entriesOf(node).length === 0) {
        return check
          ? { over: true, reason: "checkmate", winner: other(node.pos.turn), check }
          : { over: true, reason: "stalemate", winner: null, check };
      }
      if (insufficientMaterial(node.pos.board)) {
        return { over: true, reason: "insufficient", winner: null, check };
      }
      if (stack.filter((item) => item.key === node.key).length >= 3) {
        return { over: true, reason: "repetition", winner: null, check };
      }
      if (node.pos.halfmove >= FIFTY_MOVE_PLIES) {
        return { over: true, reason: "fifty", winner: null, check };
      }
      return { over: false, reason: null, winner: null, check };
    }

    return {
      get position() {
        return top().pos;
      },
      get turn() {
        return top().pos.turn;
      },
      legalMoves() {
        return entriesOf(top()).map((entry) => entry.move);
      },
      movesFrom(from) {
        return entriesOf(top()).map((entry) => entry.move).filter((item) => item.from === from);
      },
      move,
      undo,
      canUndo() {
        return stack.length > 1;
      },
      status,
      history() {
        return stack.slice(1).map((node) => node.san);
      },
      lastMove() {
        return top().move;
      },
      fen() {
        return toFEN(top().pos);
      },
    };
  }

  return {
    START_FEN,
    colorOf,
    other,
    squareName,
    parseSquare,
    parseFEN,
    toFEN,
    isAttacked,
    inCheck,
    applyMove,
    legalEntries,
    legalMoves,
    perft,
    toSAN,
    insufficientMaterial,
    positionKey,
    createGame,
  };
});

