/*
 * Interface do xadrez. Depende de engine.js e ai.js.
 *
 * Toda a escrita no DOM usa createElement/textContent (sem innerHTML). O
 * tabuleiro tem 64 botoes criados uma unica vez e atualizados a cada render,
 * o que preserva o foco do teclado.
 */
(function (root, factory) {
  "use strict";

  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
    return;
  }

  root.ChessUI = api;

  const doc = root.document;
  if (!doc) {
    return;
  }

  const start = () => {
    const element = doc.querySelector("[data-chess-game]");
    if (!element) {
      return;
    }
    api.init(element, {
      document: doc,
      engine: root.ChessEngine,
      ai: root.ChessAI,
      storage: safeStorage(root),
      createWorker: typeof root.Worker === "function" ? (url) => new root.Worker(url) : null,
    });
  };

  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  function safeStorage(scope) {
    return {
      getItem(key) {
        try {
          return scope.localStorage.getItem(key);
        } catch {
          return null;
        }
      },
      setItem(key, value) {
        try {
          scope.localStorage.setItem(key, value);
        } catch {
          /* Armazenamento indisponivel: as preferencias valem so nesta pagina. */
        }
      },
    };
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const STORAGE_KEY = "chess_v1";
  const LEVELS = ["easy", "medium", "hard"];
  const MODES = ["machine", "local"];
  const MIN_MACHINE_DELAY_MS = 450;
  const GLYPHS = { k: "\u265A", q: "\u265B", r: "\u265C", b: "\u265D", n: "\u265E", p: "\u265F" };
  // U+FE0E pede a apresentacao em texto: sem ela alguns sistemas desenham o peao como emoji.
  const TEXT_PRESENTATION = "\uFE0E";
  const PIECE_NAMES = {
    k: { name: "rei", feminine: false },
    q: { name: "dama", feminine: true },
    r: { name: "torre", feminine: true },
    b: { name: "bispo", feminine: false },
    n: { name: "cavalo", feminine: false },
    p: { name: "peão", feminine: false },
  };
  const COLOR_LABEL = { w: "Brancas", b: "Pretas" };
  const END_MESSAGES = {
    stalemate: "Empate por afogamento.",
    insufficient: "Empate por material insuficiente.",
    repetition: "Empate por repetição de posição.",
    fifty: "Empate pela regra dos 50 lances.",
  };

  function defaultPrefs() {
    return { level: "medium", mode: "machine", side: "w", record: { wins: 0, losses: 0, draws: 0 } };
  }

  function count(value) {
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  }

  // Valida o que veio do armazenamento: qualquer valor fora da lista cai no padrao.
  function loadPrefs(storage) {
    const prefs = defaultPrefs();
    try {
      const data = JSON.parse(storage.getItem(STORAGE_KEY) || "null");
      if (data && typeof data === "object") {
        if (LEVELS.includes(data.level)) {
          prefs.level = data.level;
        }
        if (MODES.includes(data.mode)) {
          prefs.mode = data.mode;
        }
        if (data.side === "w" || data.side === "b") {
          prefs.side = data.side;
        }
        if (data.record && typeof data.record === "object") {
          prefs.record = { wins: count(data.record.wins), losses: count(data.record.losses), draws: count(data.record.draws) };
        }
      }
    } catch {
      /* JSON corrompido: usa o padrao. */
    }
    return prefs;
  }

  function describePiece(piece) {
    if (!piece) {
      return "vazia";
    }
    const info = PIECE_NAMES[piece.toLowerCase()];
    const white = piece < "a";
    const color = white ? (info.feminine ? "branca" : "branco") : (info.feminine ? "preta" : "preto");
    return `${info.name} ${color}`;
  }

  function init(rootEl, deps) {
    const E = deps.engine;
    const AI = deps.ai;
    const doc = deps.document || document;
    const storage = deps.storage || { getItem: () => null, setItem: () => {} };
    const schedule = deps.setTimeout || ((fn, ms) => setTimeout(fn, ms));
    const cancel = deps.clearTimeout || ((id) => clearTimeout(id));
    const now = deps.now || (() => Date.now());
    const minDelay = typeof deps.minDelay === "number" ? deps.minDelay : MIN_MACHINE_DELAY_MS;
    const workerUrl = rootEl.getAttribute("data-chess-worker-url") || "";

    const el = {
      board: rootEl.querySelector("[data-chess-board]"),
      turn: rootEl.querySelector("[data-chess-turn]"),
      message: rootEl.querySelector("[data-chess-message]"),
      moves: rootEl.querySelector("[data-chess-moves]"),
      record: rootEl.querySelector("[data-chess-record]"),
      mode: rootEl.querySelector("[data-chess-mode]"),
      side: rootEl.querySelector("[data-chess-side]"),
      level: rootEl.querySelector("[data-chess-level]"),
      newGame: rootEl.querySelector("[data-chess-new]"),
      undo: rootEl.querySelector("[data-chess-undo]"),
      flip: rootEl.querySelector("[data-chess-flip]"),
      promotion: rootEl.querySelector("[data-chess-promotion]"),
    };
    const promoteButtons = Array.from(rootEl.querySelectorAll("[data-chess-promote]"));

    if (!E || !AI || Object.values(el).some((item) => !item) || promoteButtons.length === 0) {
      return null;
    }

    const prefs = loadPrefs(storage);
    const state = {
      game: E.createGame(),
      mode: prefs.mode,
      human: prefs.side,
      level: prefs.level,
      orientation: prefs.mode === "machine" ? prefs.side : "w",
      selected: -1,
      targets: [],
      pending: null,
      thinking: false,
      requestId: 0,
      timer: 0,
      worker: null,
      workerFailed: false,
      record: prefs.record,
      recorded: false,
      focus: 52,
      notice: "",
    };

    const squares = [];

    function save() {
      storage.setItem(STORAGE_KEY, JSON.stringify({
        level: state.level,
        mode: el.mode.value === "local" ? "local" : "machine",
        side: el.side.value === "b" ? "b" : "w",
        record: state.record,
      }));
    }

    /* ----------------------------- Tabuleiro ----------------------------- */

    // Posicao de tela (0 = canto superior esquerdo) -> indice do tabuleiro.
    function indexAt(display) {
      return state.orientation === "w" ? display : 63 - display;
    }

    function buildBoard() {
      el.board.textContent = "";
      for (let display = 0; display < 64; display += 1) {
        const button = doc.createElement("button");
        button.type = "button";
        button.setAttribute("data-chess-square", "");

        const piece = doc.createElement("span");
        piece.className = "chess-piece";
        piece.setAttribute("aria-hidden", "true");
        const dot = doc.createElement("span");
        dot.className = "chess-dot";
        dot.setAttribute("aria-hidden", "true");
        button.append(piece, dot);

        button.addEventListener("click", () => onSquare(display));
        button.addEventListener("keydown", (event) => onKey(display, event));

        squares.push({ button, piece });
        el.board.append(button);
      }
    }

    function controllable(color) {
      return color === state.game.turn && (state.mode === "local" || color === state.human);
    }

    function locked() {
      return state.game.status().over || state.thinking || Boolean(state.pending);
    }

    function clearSelection() {
      state.selected = -1;
      state.targets = [];
    }

    function select(index) {
      state.selected = index;
      state.targets = state.game.movesFrom(index);
    }

    function onSquare(display) {
      const index = indexAt(display);
      state.focus = display;
      state.notice = "";

      if (state.pending) {
        cancelPromotion();
        return;
      }
      if (locked()) {
        render();
        return;
      }

      if (state.selected >= 0 && state.targets.some((move) => move.to === index)) {
        attemptMove(state.selected, index);
        return;
      }

      const piece = state.game.position.board[index];
      if (piece && index !== state.selected && controllable(E.colorOf(piece)) && state.game.movesFrom(index).length > 0) {
        select(index);
      } else {
        clearSelection();
      }
      render();
    }

    function focusSquare(display) {
      state.focus = display;
      squares.forEach((item, position) => {
        item.button.setAttribute("tabindex", position === display ? "0" : "-1");
      });
      squares[display].button.focus();
    }

    function onKey(display, event) {
      const row = display >> 3;
      const col = display & 7;
      let next = -1;

      switch (event.key) {
        case "ArrowUp":
          next = row > 0 ? display - 8 : -1;
          break;
        case "ArrowDown":
          next = row < 7 ? display + 8 : -1;
          break;
        case "ArrowLeft":
          next = col > 0 ? display - 1 : -1;
          break;
        case "ArrowRight":
          next = col < 7 ? display + 1 : -1;
          break;
        case "Escape":
          if (state.pending) {
            cancelPromotion();
          } else if (state.selected >= 0) {
            clearSelection();
            render();
          }
          return;
        default:
          return;
      }

      event.preventDefault();
      if (next >= 0) {
        focusSquare(next);
      }
    }

    /* ------------------------------ Jogadas ------------------------------ */

    function attemptMove(from, to) {
      const candidates = state.targets.filter((move) => move.to === to);
      if (candidates.length === 0) {
        return;
      }
      if (candidates[0].promotion) {
        state.pending = { from, to };
        el.promotion.hidden = false;
        render();
        promoteButtons[0].focus();
        return;
      }
      commit({ from, to });
    }

    function cancelPromotion() {
      state.pending = null;
      el.promotion.hidden = true;
      render();
      squares[state.focus].button.focus();
    }

    function choosePromotion(piece) {
      if (!state.pending) {
        return;
      }
      const { from, to } = state.pending;
      state.pending = null;
      el.promotion.hidden = true;
      commit({ from, to, promotion: piece });
      squares[state.focus].button.focus();
    }

    function commit(input) {
      if (!state.game.move(input)) {
        clearSelection();
        render();
        return;
      }
      clearSelection();
      afterMove();
    }

    function afterMove() {
      recordIfOver();
      render();
      queueMachine();
    }

    function recordIfOver() {
      const status = state.game.status();
      if (!status.over || state.recorded) {
        return;
      }
      state.recorded = true;
      if (state.mode !== "machine") {
        return;
      }
      if (status.winner === null) {
        state.record.draws += 1;
      } else if (status.winner === state.human) {
        state.record.wins += 1;
      } else {
        state.record.losses += 1;
      }
      save();
    }

    /* ------------------------------- Maquina ------------------------------- */

    function stopThinking() {
      state.requestId += 1;
      state.thinking = false;
      if (state.timer) {
        cancel(state.timer);
        state.timer = 0;
      }
      if (state.worker) {
        state.worker.terminate();
        state.worker = null;
      }
    }

    function ensureWorker() {
      if (state.worker || state.workerFailed || !deps.createWorker || !workerUrl) {
        return state.worker;
      }
      try {
        state.worker = deps.createWorker(workerUrl);
        state.worker.onmessage = onWorkerMessage;
        state.worker.onerror = onWorkerFailure;
      } catch {
        state.workerFailed = true;
        state.worker = null;
      }
      return state.worker;
    }

    function onWorkerMessage(event) {
      const data = event.data || {};
      if (data.id !== state.requestId) {
        return;
      }
      if (data.error || !data.move) {
        runOnMainThread(data.id);
        return;
      }
      deliver(data.id, data.move);
    }

    function onWorkerFailure() {
      state.workerFailed = true;
      if (state.worker) {
        state.worker.terminate();
        state.worker = null;
      }
      if (state.thinking) {
        runOnMainThread(state.requestId);
      }
    }

    function runOnMainThread(id) {
      schedule(() => {
        if (id !== state.requestId || !state.thinking) {
          return;
        }
        const game = E.createGame(state.game.fen());
        deliver(id, AI.chooseMove(game, state.level));
      }, 20);
    }

    function queueMachine() {
      const status = state.game.status();
      if (state.mode !== "machine" || status.over || state.game.turn === state.human) {
        return;
      }

      state.thinking = true;
      const id = state.requestId + 1;
      state.requestId = id;
      state.startedAt = now();
      render();

      const worker = ensureWorker();
      if (worker) {
        worker.postMessage({ id, fen: state.game.fen(), level: state.level });
      } else {
        runOnMainThread(id);
      }
    }

    function deliver(id, move) {
      if (id !== state.requestId) {
        return;
      }
      const wait = Math.max(0, minDelay - (now() - state.startedAt));
      state.timer = schedule(() => {
        state.timer = 0;
        if (id !== state.requestId) {
          return;
        }
        state.thinking = false;
        if (!move || !state.game.move(move)) {
          state.notice = "A máquina não encontrou uma jogada. Inicie um novo jogo.";
          render();
          return;
        }
        afterMove();
      }, wait);
    }

    /* ------------------------------- Desenho ------------------------------- */

    function statusText(status) {
      if (state.notice) {
        return state.notice;
      }
      if (status.over) {
        const base = status.reason === "checkmate"
          ? `Xeque-mate. ${COLOR_LABEL[status.winner]} venceram.`
          : END_MESSAGES[status.reason];
        return `${base} Use Novo jogo para recomeçar.`;
      }
      if (state.pending) {
        return "Escolha a peça para a promoção (Esc cancela).";
      }
      if (state.thinking) {
        return "A máquina está pensando…";
      }

      const turn = state.game.turn;
      const prefix = status.check ? "Xeque! " : "";
      if (state.mode === "machine") {
        return `${prefix}Sua vez (${COLOR_LABEL[turn].toLowerCase()}).`;
      }
      return `${prefix}Vez das ${COLOR_LABEL[turn].toLowerCase()}.`;
    }

    function renderBoard(status) {
      const position = state.game.position;
      const last = state.game.lastMove();
      const checked = status.check ? position.board.indexOf(position.turn === "w" ? "K" : "k") : -1;
      const targets = new Map(state.targets.map((move) => [move.to, move]));

      for (let display = 0; display < 64; display += 1) {
        const index = indexAt(display);
        const piece = position.board[index];
        const { button, piece: pieceEl } = squares[display];
        const row = index >> 3;
        const col = index & 7;
        const classes = ["chess-square", (row + col) % 2 === 0 ? "is-light" : "is-dark"];
        const notes = [];

        if (last && (last.from === index || last.to === index)) {
          classes.push("is-last");
        }
        if (index === checked) {
          classes.push("is-check");
        }
        if (index === state.selected) {
          classes.push("is-selected");
          notes.push("selecionada");
        }
        if (targets.has(index)) {
          classes.push(targets.get(index).captured ? "is-capture" : "is-target");
          notes.push(targets.get(index).captured ? "captura possível" : "destino possível");
        }

        button.className = classes.join(" ");
        button.setAttribute("tabindex", display === state.focus ? "0" : "-1");
        button.setAttribute("aria-label", [`${E.squareName(index)}, ${describePiece(piece)}`].concat(notes).join(", "));

        if (display >> 3 === 7) {
          button.setAttribute("data-file", E.squareName(index)[0]);
        } else {
          button.removeAttribute("data-file");
        }
        if ((display & 7) === 0) {
          button.setAttribute("data-rank", E.squareName(index)[1]);
        } else {
          button.removeAttribute("data-rank");
        }

        pieceEl.className = piece ? `chess-piece is-${piece < "a" ? "white" : "black"}` : "chess-piece";
        pieceEl.textContent = piece ? GLYPHS[piece.toLowerCase()] + TEXT_PRESENTATION : "";
      }
    }

    function renderMoves() {
      const history = state.game.history();
      el.moves.textContent = "";
      for (let ply = 0; ply < history.length; ply += 2) {
        const item = doc.createElement("li");
        item.textContent = history[ply + 1] ? `${history[ply]}  ${history[ply + 1]}` : history[ply];
        el.moves.append(item);
      }
      if (typeof el.moves.scrollHeight === "number") {
        el.moves.scrollTop = el.moves.scrollHeight;
      }
    }

    function render() {
      const status = state.game.status();

      renderBoard(status);
      renderMoves();

      el.turn.textContent = status.over ? "-" : COLOR_LABEL[state.game.turn];
      el.message.textContent = statusText(status);
      el.undo.disabled = !state.game.canUndo();
      el.level.disabled = el.mode.value === "local";
      el.side.disabled = el.mode.value === "local";
      el.record.textContent = `Você ${state.record.wins} · Máquina ${state.record.losses} · Empates ${state.record.draws}`;
      el.board.setAttribute("aria-busy", state.thinking ? "true" : "false");
    }

    /* ------------------------------ Controles ------------------------------ */

    function startNewGame() {
      stopThinking();
      state.game = E.createGame();
      state.mode = el.mode.value === "local" ? "local" : "machine";
      state.human = el.side.value === "b" ? "b" : "w";
      state.orientation = state.mode === "machine" ? state.human : "w";
      state.recorded = false;
      state.notice = "";
      state.pending = null;
      el.promotion.hidden = true;
      clearSelection();
      save();
      render();
      queueMachine();
    }

    function undo() {
      if (!state.game.canUndo()) {
        return;
      }
      stopThinking();
      state.pending = null;
      el.promotion.hidden = true;
      state.notice = "";
      state.game.undo();
      // Contra a maquina desfaz o par de jogadas, devolvendo a vez ao humano.
      if (state.mode === "machine" && state.game.turn !== state.human && state.game.canUndo()) {
        state.game.undo();
      }
      state.recorded = state.game.status().over;
      clearSelection();
      render();
      queueMachine();
    }

    function settingsChanged() {
      // Antes do primeiro lance a mudanca vale na hora; depois, so no proximo jogo.
      if (!state.game.canUndo()) {
        startNewGame();
        return;
      }
      state.notice = "A mudança vale a partir do próximo Novo jogo.";
      save();
      render();
    }

    el.newGame.addEventListener("click", startNewGame);
    el.undo.addEventListener("click", undo);
    el.flip.addEventListener("click", () => {
      state.orientation = state.orientation === "w" ? "b" : "w";
      render();
    });
    el.level.addEventListener("change", () => {
      state.level = LEVELS.includes(el.level.value) ? el.level.value : "medium";
      save();
    });
    el.mode.addEventListener("change", settingsChanged);
    el.side.addEventListener("change", settingsChanged);
    promoteButtons.forEach((button) => {
      button.addEventListener("click", () => choosePromotion(button.getAttribute("data-chess-promote")));
    });

    el.mode.value = prefs.mode;
    el.side.value = prefs.side;
    el.level.value = prefs.level;
    el.promotion.hidden = true;

    buildBoard();
    render();
    queueMachine();

    return {
      state,
      select: (index) => {
        select(index);
        render();
      },
      click: (index) => onSquare(state.orientation === "w" ? index : 63 - index),
      startNewGame,
      undo,
    };
  }

  return { init, loadPrefs, describePiece, STORAGE_KEY };
});

