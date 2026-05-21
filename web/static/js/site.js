(() => {
  function setHidden(element, hidden) {
    if (!element) {
      return;
    }

    element.hidden = hidden;
    element.classList.toggle("is-hidden", hidden);
  }

  function setupFooterSecret() {
    const footer = document.querySelector("[data-footer-secret]");

    if (!footer || window.location.pathname !== "/") {
      return;
    }

    let lastActivation = 0;

    footer.addEventListener("pointerup", () => {
      const now = Date.now();

      if (now - lastActivation <= 1400) {
        window.location.assign("/convite");
        return;
      }

      lastActivation = now;
    });
  }

  function setupNotFoundPath() {
    const pathLabel = document.querySelector("[data-not-found-path]");

    if (!pathLabel) {
      return;
    }

    pathLabel.textContent = window.location.pathname || "/";
  }

  function setupSpotifyEmbeds() {
    const embeds = Array.from(document.querySelectorAll("[data-spotify-embed]"));

    if (embeds.length === 0) {
      return;
    }

    const controllers = [];
    let initialized = false;

    const pauseOtherPlayers = (activeController) => {
      for (const controller of controllers) {
        if (controller === activeController) {
          continue;
        }

        controller.pause();
      }
    };

    const renderFallbackEmbeds = () => {
      if (initialized) {
        return;
      }

      initialized = true;

      for (const embed of embeds) {
        if (embed.querySelector("iframe")) {
          continue;
        }

        const iframe = document.createElement("iframe");
        iframe.title = embed.dataset.spotifyTitle || "Spotify";
        iframe.src = embed.dataset.spotifySrc || spotifyEmbedURL(embed.dataset.spotifyResource || "");
        iframe.width = "100%";
        iframe.height = embed.dataset.spotifyHeight || "152";
        iframe.frameBorder = "0";
        iframe.allow = "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
        iframe.allowFullscreen = true;
        iframe.loading = "lazy";
        embed.replaceChildren(iframe);
      }
    };

    const createControllers = (IFrameAPI) => {
      if (initialized) {
        return;
      }

      initialized = true;

      for (const embed of embeds) {
        const uri = embed.dataset.spotifyResource;

        if (!uri) {
          continue;
        }

        IFrameAPI.createController(
          embed,
          {
            uri,
            width: "100%",
            height: Number.parseInt(embed.dataset.spotifyHeight || "152", 10) || 152,
          },
          (controller) => {
            controllers.push(controller);

            controller.addListener("playback_started", () => {
              pauseOtherPlayers(controller);
            });

            controller.addListener("playback_update", (event) => {
              if (event?.data?.isPaused === false) {
                pauseOtherPlayers(controller);
              }
            });
          },
        );
      }
    };

    const previousReadyHandler = window.onSpotifyIframeApiReady;
    window.onSpotifyIframeApiReady = (IFrameAPI) => {
      if (typeof previousReadyHandler === "function") {
        previousReadyHandler(IFrameAPI);
      }

      createControllers(IFrameAPI);
    };

    if (!document.querySelector('script[data-spotify-iframe-api="true"]')) {
      const script = document.createElement("script");
      script.src = "https://open.spotify.com/embed/iframe-api/v1";
      script.async = true;
      script.dataset.spotifyIframeApi = "true";
      script.addEventListener("error", renderFallbackEmbeds, { once: true });
      document.body.append(script);
    }

    window.setTimeout(renderFallbackEmbeds, 6000);
  }

  function spotifyEmbedURL(uri) {
    const parts = uri.split(":");

    if (parts.length < 3) {
      return "";
    }

    return `https://open.spotify.com/embed/${parts[1]}/${parts[2]}?utm_source=generator&theme=0`;
  }

  function setupBlogBrowser() {
    const browser = document.querySelector("[data-blog-browser]");

    if (!browser) {
      return;
    }

    setupBlogSearch(browser);
    setupBlogFilters(browser);
  }

  function setupProjectsCatalog() {
    const catalog = document.querySelector("[data-projects-catalog]");

    if (!catalog) {
      return;
    }

    const grid = catalog.querySelector("[data-projects-grid]");
    const languageSelect = catalog.querySelector("[data-projects-language]");
    const sortSelect = catalog.querySelector("[data-projects-sort]");
    const countLabel = catalog.querySelector("[data-projects-count]");
    const statusLabel = catalog.querySelector("[data-projects-status]");
    const emptyState = catalog.querySelector("[data-projects-empty]");
    const pagination = catalog.querySelector("[data-projects-pagination]");
    const url = catalog.dataset.projectsUrl || "";
    const pageSize = Number.parseInt(catalog.dataset.projectsPageSize || "8", 10) || 8;

    if (!grid || !languageSelect || !sortSelect || !statusLabel || !pagination || !url) {
      return;
    }

    const state = {
      projects: [],
      language: "all",
      sort: "recent",
      page: 1,
      status: "loading",
    };

    const controller = new AbortController();
    window.addEventListener("pagehide", () => controller.abort(), { once: true });

    const normalizeProject = (repo) => ({
      id: repo.id,
      name: repo.name,
      description: repo.description || "Sem descrição por enquanto.",
      repoUrl: repo.html_url,
      liveUrl: repo.homepage || "",
      tags: repo.language ? [repo.language] : [],
      language: repo.language || "",
      stars: Number(repo.stargazers_count) || 0,
      updatedAt: repo.pushed_at,
      createdAt: repo.created_at,
    });

    const safeHTTPURL = (value) => {
      if (!value) {
        return "";
      }

      try {
        const parsed = new URL(value);
        return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "";
      } catch {
        return "";
      }
    };

    const projectLanguages = () => {
      const languages = new Set();
      for (const project of state.projects) {
        if (project.language) {
          languages.add(project.language);
        }
      }
      return Array.from(languages).sort((left, right) => left.localeCompare(right, "pt-BR"));
    };

    const renderLanguageOptions = () => {
      const fragment = document.createDocumentFragment();
      const all = document.createElement("option");
      all.value = "all";
      all.textContent = "Todas";
      fragment.append(all);

      for (const language of projectLanguages()) {
        const option = document.createElement("option");
        option.value = language;
        option.textContent = language;
        fragment.append(option);
      }

      languageSelect.replaceChildren(fragment);
      languageSelect.value = state.language;
    };

    const filteredProjects = () => {
      if (state.language === "all") {
        return state.projects;
      }
      return state.projects.filter((project) => project.language === state.language);
    };

    const sortedProjects = () => {
      const sorted = [...filteredProjects()];

      switch (state.sort) {
        case "stars-desc":
          return sorted.sort((left, right) => right.stars - left.stars);
        case "stars-asc":
          return sorted.sort((left, right) => left.stars - right.stars);
        case "name-desc":
          return sorted.sort((left, right) => right.name.localeCompare(left.name, "pt-BR"));
        case "name-asc":
          return sorted.sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
        case "created":
          return sorted.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
        case "recent":
        default:
          return sorted.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
      }
    };

    const formatDate = (value) => {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return "Sem data";
      }
      return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(date);
    };

    const appendProjectLink = (container, label, href) => {
      const safeURL = safeHTTPURL(href);
      if (!safeURL) {
        return;
      }

      const link = document.createElement("a");
      link.className = "arrow-shift";
      link.href = safeURL;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.append(document.createTextNode(`${label} `));

      const arrow = document.createElement("span");
      arrow.className = "link-arrow";
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "->";
      link.append(arrow);
      container.append(link);
    };

    const projectCard = (project) => {
      const card = document.createElement("article");
      card.className = "project-card";

      const title = document.createElement("h3");
      title.textContent = project.name;

      const meta = document.createElement("div");
      meta.className = "project-card__meta";

      const language = document.createElement("span");
      language.className = "project-card__language";
      language.textContent = project.language || "Sem linguagem";

      const stars = document.createElement("span");
      stars.textContent = `${project.stars} ${project.stars === 1 ? "estrela" : "estrelas"}`;

      const updatedAt = document.createElement("span");
      updatedAt.textContent = `push em ${formatDate(project.updatedAt)}`;

      meta.append(language, stars, updatedAt);

      const description = document.createElement("p");
      description.textContent = project.description;

      const links = document.createElement("div");
      links.className = "project-card__links";
      appendProjectLink(links, "Código", project.repoUrl);
      appendProjectLink(links, "Demo", project.liveUrl);

      card.append(title, meta, description, links);
      return card;
    };

    const renderPagination = (totalPages) => {
      pagination.textContent = "";
      if (totalPages <= 1) {
        return;
      }

      const addButton = (label, page, options = {}) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.disabled = Boolean(options.disabled);
        button.classList.toggle("is-active", Boolean(options.active));
        if (options.active) {
          button.setAttribute("aria-current", "page");
        }
        button.addEventListener("click", () => {
          state.page = page;
          render();
        });
        pagination.append(button);
      };

      addButton("Anterior", Math.max(1, state.page - 1), { disabled: state.page === 1 });
      for (let page = 1; page <= totalPages; page += 1) {
        addButton(String(page), page, { active: page === state.page });
      }
      addButton("Próxima", Math.min(totalPages, state.page + 1), { disabled: state.page === totalPages });
    };

    const render = () => {
      if (state.status !== "success") {
        return;
      }

      const projects = sortedProjects();
      const totalPages = Math.max(1, Math.ceil(projects.length / pageSize));
      state.page = Math.min(Math.max(state.page, 1), totalPages);

      const start = (state.page - 1) * pageSize;
      const currentProjects = projects.slice(start, start + pageSize);
      const cards = currentProjects.map(projectCard);
      grid.replaceChildren(...cards);

      if (countLabel) {
        countLabel.textContent = `Mostrando ${projects.length} de ${state.projects.length} projetos.`;
      }

      setHidden(emptyState, projects.length !== 0);
      renderPagination(totalPages);
    };

    const setStatus = (status, message) => {
      state.status = status;
      statusLabel.textContent = message;
      setHidden(statusLabel, status === "success");
    };

    languageSelect.addEventListener("change", () => {
      state.language = languageSelect.value || "all";
      state.page = 1;
      render();
    });

    sortSelect.addEventListener("change", () => {
      state.sort = sortSelect.value || "recent";
      state.page = 1;
      render();
    });

    const fetchProjects = async () => {
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            Accept: "application/vnd.github+json",
          },
        });

        if (!response.ok) {
          throw new Error("GitHub API request failed.");
        }

        const data = await response.json();
        if (!Array.isArray(data)) {
          throw new Error("GitHub API payload was not a list.");
        }

        state.projects = data
          .map(normalizeProject)
          .filter((project) => project.id && project.name && safeHTTPURL(project.repoUrl));
        renderLanguageOptions();
        setStatus("success", "");
        render();
      } catch (error) {
        if (error?.name === "AbortError") {
          return;
        }

        if (countLabel) {
          countLabel.textContent = "Projetos indisponíveis.";
        }
        setStatus("error", "Não foi possível carregar os projetos agora.");
      }
    };

    fetchProjects();
  }

  function setupGames() {
    setupMemoryGame();
    setupSequenceGame();
    setupReactionGame();
    setupSolitaireGame();
  }

  function shuffled(items) {
    const copy = [...items];

    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }

    return copy;
  }

  function setupMemoryGame() {
    const root = document.querySelector("[data-memory-game]");

    if (!root) {
      return;
    }

    const board = root.querySelector("[data-memory-board]");
    const restart = root.querySelector("[data-memory-restart]");
    const movesLabel = root.querySelector("[data-memory-moves]");
    const pairsLabel = root.querySelector("[data-memory-pairs]");
    const timeLabel = root.querySelector("[data-memory-time]");
    const status = root.querySelector("[data-memory-status]");

    if (!board || !restart || !movesLabel || !pairsLabel || !timeLabel || !status) {
      return;
    }

    const labels = ["Go", "JS", "CSS", "API", "SQL", "UX", "Git", "CLI"];
    const state = {
      openCards: [],
      locked: false,
      moves: 0,
      pairs: 0,
      startedAt: 0,
      timer: 0,
    };

    const updateStatus = (message) => {
      status.textContent = message;
    };

    const updateStats = () => {
      movesLabel.textContent = String(state.moves);
      pairsLabel.textContent = String(state.pairs);
    };

    const updateTimer = () => {
      if (!state.startedAt) {
        timeLabel.textContent = "0s";
        return;
      }

      const elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
      timeLabel.textContent = `${elapsed}s`;
    };

    const startTimer = () => {
      if (state.startedAt) {
        return;
      }

      state.startedAt = Date.now();
      updateTimer();
      state.timer = window.setInterval(updateTimer, 1000);
    };

    const stopTimer = () => {
      window.clearInterval(state.timer);
      state.timer = 0;
    };

    const hideCard = (button) => {
      button.classList.add("is-hidden-card");
      button.classList.remove("is-open");
      button.textContent = "?";
      button.setAttribute("aria-label", "Carta fechada");
    };

    const showCard = (button) => {
      button.classList.remove("is-hidden-card");
      button.classList.add("is-open");
      button.textContent = button.dataset.value || "";
      button.setAttribute("aria-label", `Carta ${button.dataset.value || ""}`);
    };

    const reset = () => {
      stopTimer();
      state.openCards = [];
      state.locked = false;
      state.moves = 0;
      state.pairs = 0;
      state.startedAt = 0;
      updateStats();
      updateTimer();
      updateStatus("Encontre todos os pares.");

      const deck = shuffled([...labels, ...labels]).map((label, index) => ({ id: `${label}-${index}`, label }));
      const cards = deck.map((card) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "memory-card is-hidden-card";
        button.dataset.memoryCard = card.id;
        button.dataset.value = card.label;
        button.textContent = "?";
        button.setAttribute("aria-label", "Carta fechada");
        return button;
      });

      board.replaceChildren(...cards);
    };

    const finishPairCheck = () => {
      const [first, second] = state.openCards;

      if (!first || !second) {
        return;
      }

      state.moves += 1;

      if (first.dataset.value === second.dataset.value) {
        first.classList.add("is-matched");
        second.classList.add("is-matched");
        first.disabled = true;
        second.disabled = true;
        state.pairs += 1;
        state.openCards = [];
        state.locked = false;

        if (state.pairs === labels.length) {
          stopTimer();
          updateStatus(`Fechado em ${state.moves} jogadas. Bela rodada.`);
        } else {
          updateStatus("Par encontrado.");
        }
      } else {
        state.locked = true;
        updateStatus("Essas cartas não formam par.");
        window.setTimeout(() => {
          hideCard(first);
          hideCard(second);
          state.openCards = [];
          state.locked = false;
          updateStatus("Continue procurando.");
        }, 700);
      }

      updateStats();
    };

    board.addEventListener("click", (event) => {
      const button = event.target.closest("[data-memory-card]");

      if (!button || !board.contains(button) || state.locked || button.disabled || state.openCards.includes(button)) {
        return;
      }

      startTimer();
      showCard(button);
      state.openCards.push(button);

      if (state.openCards.length === 2) {
        finishPairCheck();
      }
    });

    restart.addEventListener("click", reset);
    reset();
  }

  function setupSequenceGame() {
    const root = document.querySelector("[data-sequence-game]");

    if (!root) {
      return;
    }

    const start = root.querySelector("[data-sequence-start]");
    const roundLabel = root.querySelector("[data-sequence-round]");
    const scoreLabel = root.querySelector("[data-sequence-score]");
    const status = root.querySelector("[data-sequence-status]");
    const pads = Array.from(root.querySelectorAll("[data-sequence-pad]")).sort(
      (left, right) => Number(left.dataset.sequencePad) - Number(right.dataset.sequencePad),
    );

    if (!start || !roundLabel || !scoreLabel || !status || pads.length === 0) {
      return;
    }

    const state = {
      sequence: [],
      inputIndex: 0,
      accepting: false,
      token: 0,
    };

    const sleep = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

    const setPadsDisabled = (disabled) => {
      for (const pad of pads) {
        pad.disabled = disabled;
      }
    };

    const setStatus = (message) => {
      status.textContent = message;
    };

    const lightPad = async (padIndex, token) => {
      const pad = pads[padIndex];
      if (!pad || token !== state.token) {
        return;
      }

      pad.classList.add("is-lit");
      await sleep(420);
      pad.classList.remove("is-lit");
      await sleep(160);
    };

    const playSequence = async () => {
      const token = state.token;
      state.accepting = false;
      setPadsDisabled(true);
      setStatus("Observe a sequência.");
      await sleep(400);

      for (const padIndex of state.sequence) {
        if (token !== state.token) {
          return;
        }
        await lightPad(padIndex, token);
      }

      if (token !== state.token) {
        return;
      }

      state.inputIndex = 0;
      state.accepting = true;
      setPadsDisabled(false);
      setStatus("Sua vez.");
    };

    const nextRound = () => {
      state.sequence.push(Math.floor(Math.random() * pads.length));
      roundLabel.textContent = String(state.sequence.length);
      void playSequence();
    };

    const startGame = () => {
      state.token += 1;
      state.sequence = [];
      state.inputIndex = 0;
      state.accepting = false;
      roundLabel.textContent = "0";
      scoreLabel.textContent = "0";
      start.textContent = "Recomeçar";
      nextRound();
    };

    const failGame = () => {
      state.accepting = false;
      setPadsDisabled(true);
      start.textContent = "Tentar de novo";
      setStatus(`Fim de jogo. Pontuação: ${Math.max(0, state.sequence.length - 1)}.`);
    };

    start.addEventListener("click", startGame);

    for (const pad of pads) {
      pad.addEventListener("click", async () => {
        if (!state.accepting) {
          return;
        }

        const value = Number(pad.dataset.sequencePad);
        pad.classList.add("is-lit");
        window.setTimeout(() => pad.classList.remove("is-lit"), 180);

        if (value !== state.sequence[state.inputIndex]) {
          failGame();
          return;
        }

        state.inputIndex += 1;

        if (state.inputIndex === state.sequence.length) {
          state.accepting = false;
          setPadsDisabled(true);
          scoreLabel.textContent = String(state.sequence.length);
          setStatus("Acertou. Próxima rodada.");
          await sleep(700);
          nextRound();
        }
      });
    }

    setPadsDisabled(true);
  }

  function setupReactionGame() {
    const root = document.querySelector("[data-reaction-game]");

    if (!root) {
      return;
    }

    const start = root.querySelector("[data-reaction-start]");
    const target = root.querySelector("[data-reaction-target]");
    const lastLabel = root.querySelector("[data-reaction-last]");
    const bestLabel = root.querySelector("[data-reaction-best]");
    const status = root.querySelector("[data-reaction-status]");

    if (!start || !target || !lastLabel || !bestLabel || !status) {
      return;
    }

    let timeout = 0;
    let waiting = false;
    let ready = false;
    let readyAt = 0;
    let best = Number.POSITIVE_INFINITY;

    const setStatus = (message) => {
      status.textContent = message;
    };

    const resetTarget = () => {
      target.classList.remove("is-ready");
      target.disabled = true;
      target.textContent = "Espere";
    };

    const startRound = () => {
      window.clearTimeout(timeout);
      waiting = true;
      ready = false;
      readyAt = 0;
      target.disabled = false;
      target.classList.remove("is-ready");
      target.textContent = "Espere";
      setStatus("Aguarde o alvo ficar ativo.");

      const delay = 900 + Math.floor(Math.random() * 2200);
      timeout = window.setTimeout(() => {
        ready = true;
        readyAt = performance.now();
        target.classList.add("is-ready");
        target.textContent = "Clique";
        setStatus("Agora.");
      }, delay);
    };

    start.addEventListener("click", startRound);

    target.addEventListener("click", () => {
      if (!waiting) {
        return;
      }

      if (!ready) {
        window.clearTimeout(timeout);
        waiting = false;
        resetTarget();
        setStatus("Cedo demais. Tente outra rodada.");
        return;
      }

      const elapsed = Math.max(0, Math.round(performance.now() - readyAt));
      best = Math.min(best, elapsed);
      lastLabel.textContent = `${elapsed}ms`;
      bestLabel.textContent = `${best}ms`;
      waiting = false;
      ready = false;
      resetTarget();
      setStatus(`Tempo de reação: ${elapsed}ms.`);
    });

    resetTarget();
  }

  function setupSolitaireGame() {
    const root = document.querySelector("[data-solitaire-game]");

    if (!root) {
      return;
    }

    const suits = [
      { id: "hearts", symbol: "\u2665", color: "red", name: "Copas" },
      { id: "diamonds", symbol: "\u2666", color: "red", name: "Ouros" },
      { id: "clubs", symbol: "\u2663", color: "black", name: "Paus" },
      { id: "spades", symbol: "\u2660", color: "black", name: "Espadas" },
    ];
    const foundationDisplayOrder = buildFoundationDisplayOrder();
    const rankLabels = {
      1: "A",
      11: "J",
      12: "Q",
      13: "K",
    };
    const difficultyLabels = {
      easy: "Relaxado",
      hard: "Clássico",
    };
    const maxHistory = 200;

    const elements = {
      stock: root.querySelector('[data-solitaire-pile="stock"]'),
      waste: root.querySelector('[data-solitaire-pile="waste"]'),
      foundations: Array.from(root.querySelectorAll(".solitaire-foundation")),
      tableau: Array.from(root.querySelectorAll(".solitaire-tableau-pile")),
      timer: root.querySelector("[data-solitaire-timer]"),
      moves: root.querySelector("[data-solitaire-moves]"),
      wins: root.querySelector("[data-solitaire-wins]"),
      status: root.querySelector("[data-solitaire-status]"),
      undo: root.querySelector("[data-solitaire-undo]"),
      newGame: root.querySelector("[data-solitaire-new]"),
      hint: root.querySelector("[data-solitaire-hint]"),
      difficulty: root.querySelector("[data-solitaire-difficulty]"),
      overlay: root.querySelector("[data-solitaire-overlay]"),
      playAgain: root.querySelector("[data-solitaire-play-again]"),
    };

    if (!hasRequiredElements()) {
      return;
    }

    const readStorage = (key, fallback) => {
      try {
        return window.localStorage.getItem(key) ?? fallback;
      } catch {
        return fallback;
      }
    };

    const writeStorage = (key, value) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // A partida continua normalmente quando o navegador bloqueia storage.
      }
    };

    const savedWins = Number(readStorage("klondike_wins", "0"));
    const savedDifficulty = readStorage("klondike_difficulty", "hard");
    const state = {
      stock: [],
      waste: [],
      foundations: {
        hearts: [],
        diamonds: [],
        clubs: [],
        spades: [],
      },
      tableau: Array.from({ length: 7 }, () => []),
      selected: null,
      moves: 0,
      timerId: 0,
      startTime: 0,
      elapsed: 0,
      wins: Number.isFinite(savedWins) ? savedWins : 0,
      difficulty: savedDifficulty === "easy" ? "easy" : "hard",
      history: [],
    };

    const dragState = {
      active: false,
      pending: false,
      pointerId: null,
      startX: 0,
      startY: 0,
      offsetX: 0,
      offsetY: 0,
      sourceInfo: null,
      sourceEl: null,
      dragLayer: null,
      dragStack: null,
      sourceCardEls: [],
      justDragged: false,
    };

    const uiState = {
      lastFocusedEl: null,
    };

    let layoutMetrics = null;
    let statusTimer = 0;

    function buildFoundationDisplayOrder() {
      const redSuits = suits.filter((suit) => suit.color === "red");
      const blackSuits = suits.filter((suit) => suit.color === "black");
      const order = [];
      const maxLength = Math.max(redSuits.length, blackSuits.length);

      for (let index = 0; index < maxLength; index += 1) {
        if (redSuits[index]) {
          order.push(redSuits[index].id);
        }
        if (blackSuits[index]) {
          order.push(blackSuits[index].id);
        }
      }

      return order;
    }

    function createDeck() {
      let id = 0;
      const deck = [];

      for (const suit of suits) {
        for (let rank = 1; rank <= 13; rank += 1) {
          deck.push({
            id: `${suit.id}-${rank}-${id++}`,
            suit: suit.id,
            suitSymbol: suit.symbol,
            color: suit.color,
            rank,
            label: rankLabels[rank] || String(rank),
            faceUp: false,
          });
        }
      }

      return deck;
    }

    function shuffle(deck) {
      for (let index = deck.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
      }

      return deck;
    }

    function runTimerFromElapsed(elapsed) {
      stopTimer();
      state.elapsed = elapsed;
      state.startTime = Date.now() - state.elapsed;
      state.timerId = window.setInterval(() => {
        state.elapsed = Date.now() - state.startTime;
        updateTimer();
      }, 1000);
      updateTimer();
    }

    function resetTimer() {
      runTimerFromElapsed(0);
    }

    function stopTimer() {
      if (state.timerId) {
        window.clearInterval(state.timerId);
      }
      state.timerId = 0;
    }

    function updateTimer() {
      const totalSeconds = Math.floor(state.elapsed / 1000);
      const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
      const seconds = String(totalSeconds % 60).padStart(2, "0");
      elements.timer.textContent = `${minutes}:${seconds}`;
    }

    function setStatus(message) {
      elements.status.textContent = message;
      window.clearTimeout(statusTimer);

      if (!message) {
        return;
      }

      statusTimer = window.setTimeout(() => {
        elements.status.textContent = "";
      }, 2600);
    }

    function cloneCard(card) {
      return { ...card };
    }

    function cloneBoardState() {
      return {
        stock: state.stock.map(cloneCard),
        waste: state.waste.map(cloneCard),
        foundations: {
          hearts: state.foundations.hearts.map(cloneCard),
          diamonds: state.foundations.diamonds.map(cloneCard),
          clubs: state.foundations.clubs.map(cloneCard),
          spades: state.foundations.spades.map(cloneCard),
        },
        tableau: state.tableau.map((pile) => pile.map(cloneCard)),
        moves: state.moves,
        elapsed: state.elapsed,
        wins: state.wins,
        timerRunning: Boolean(state.timerId),
        overlayVisible: elements.overlay.classList.contains("is-visible"),
      };
    }

    function updateUndoButton() {
      elements.undo.disabled = state.history.length === 0;
    }

    function pushHistory() {
      state.history.push(cloneBoardState());

      if (state.history.length > maxHistory) {
        state.history.shift();
      }

      updateUndoButton();
    }

    function clearHistory() {
      state.history = [];
      updateUndoButton();
    }

    function restoreBoardState(snapshot) {
      if (!snapshot) {
        return;
      }

      state.stock = snapshot.stock.map(cloneCard);
      state.waste = snapshot.waste.map(cloneCard);
      state.foundations = {
        hearts: snapshot.foundations.hearts.map(cloneCard),
        diamonds: snapshot.foundations.diamonds.map(cloneCard),
        clubs: snapshot.foundations.clubs.map(cloneCard),
        spades: snapshot.foundations.spades.map(cloneCard),
      };
      state.tableau = snapshot.tableau.map((pile) => pile.map(cloneCard));
      state.moves = snapshot.moves;
      state.elapsed = snapshot.elapsed;
      state.wins = snapshot.wins;
      state.selected = null;

      if (snapshot.timerRunning) {
        runTimerFromElapsed(snapshot.elapsed);
      } else {
        stopTimer();
        state.startTime = 0;
        updateTimer();
      }

      if (snapshot.overlayVisible) {
        showOverlay();
      } else {
        hideOverlay();
      }

      writeStorage("klondike_wins", String(state.wins));
      render();
    }

    function undoMove() {
      if (!state.history.length) {
        setStatus("Não há jogadas para desfazer.");
        return;
      }

      restoreBoardState(state.history.pop());
      updateUndoButton();
      setStatus("Jogada desfeita.");
    }

    function getDifficultyLabel() {
      return difficultyLabels[state.difficulty] || difficultyLabels.hard;
    }

    function syncDifficultyUI() {
      elements.difficulty.value = state.difficulty;
    }

    function startNewGame() {
      const deck = shuffle(createDeck());
      state.stock = [];
      state.waste = [];
      state.foundations = {
        hearts: [],
        diamonds: [],
        clubs: [],
        spades: [],
      };
      state.tableau = Array.from({ length: 7 }, () => []);
      state.selected = null;
      state.moves = 0;
      clearHistory();

      for (let col = 0; col < 7; col += 1) {
        for (let row = 0; row <= col; row += 1) {
          const card = deck.pop();
          card.faceUp = row === col;
          state.tableau[col].push(card);
        }
      }

      state.stock = deck;
      resetTimer();
      updateStats();
      render();
      hideOverlay();
      setStatus(`Novo jogo iniciado (${getDifficultyLabel()}).`);
    }

    function updateStats() {
      elements.moves.textContent = String(state.moves);
      elements.wins.textContent = String(state.wins);
    }

    function computeLayoutMetrics() {
      const probe = document.createElement("div");
      probe.style.position = "absolute";
      probe.style.visibility = "hidden";
      probe.style.width = "var(--solitaire-card-width)";
      probe.style.height = "var(--solitaire-card-height)";
      probe.style.marginTop = "var(--solitaire-card-offset-up)";
      probe.style.marginBottom = "var(--solitaire-card-offset-down)";
      root.appendChild(probe);

      const rect = probe.getBoundingClientRect();
      const styles = getComputedStyle(probe);
      const cardHeight = rect.height || 118;
      const offsetUp = Number.parseFloat(styles.marginTop) || 28;
      const offsetDown = Number.parseFloat(styles.marginBottom) || 14;
      probe.remove();

      return { cardHeight, offsetUp, offsetDown };
    }

    function getLayoutMetrics() {
      if (!layoutMetrics) {
        layoutMetrics = computeLayoutMetrics();
      }

      return layoutMetrics;
    }

    function refreshLayoutMetrics() {
      layoutMetrics = computeLayoutMetrics();
    }

    function getOffsetUp() {
      return getLayoutMetrics().offsetUp;
    }

    function getOffsetDown() {
      return getLayoutMetrics().offsetDown;
    }

    function getPileHeight(pile) {
      const { cardHeight, offsetUp, offsetDown } = getLayoutMetrics();
      let height = cardHeight;

      pile.forEach((card, index) => {
        if (index === 0) {
          return;
        }
        height += card.faceUp ? offsetUp : offsetDown;
      });

      return Math.max(height, cardHeight);
    }

    function renderStock() {
      elements.stock.textContent = "";
      elements.stock.dataset.count = String(state.stock.length);

      if (!state.stock.length) {
        return;
      }

      const back = document.createElement("div");
      back.className = "solitaire-card is-face-down";
      back.setAttribute("aria-hidden", "true");
      elements.stock.append(back);
    }

    function renderWaste() {
      elements.waste.textContent = "";
      elements.waste.dataset.count = String(state.waste.length);

      if (!state.waste.length) {
        return;
      }

      const card = state.waste[state.waste.length - 1];
      elements.waste.append(createCardElement(card, { source: "waste" }));
    }

    function renderFoundations() {
      for (const foundationEl of elements.foundations) {
        const suit = foundationEl.dataset.suit;
        const pile = state.foundations[suit] || [];
        foundationEl.textContent = "";
        foundationEl.dataset.count = String(pile.length);

        if (!pile.length) {
          continue;
        }

        foundationEl.append(createCardElement(pile[pile.length - 1], { source: "foundation", suit }));
      }
    }

    function renderTableau() {
      elements.tableau.forEach((pileEl, pileIndex) => {
        const pile = state.tableau[pileIndex];
        let offset = 0;
        pileEl.textContent = "";

        pile.forEach((card, cardIndex) => {
          const cardEl = createCardElement(card, {
            source: "tableau",
            pile: pileIndex,
            index: cardIndex,
          });
          cardEl.style.top = `${offset}px`;
          cardEl.style.zIndex = String(cardIndex + 1);
          offset += card.faceUp ? getOffsetUp() : getOffsetDown();

          if (isCardSelected(pileIndex, cardIndex)) {
            cardEl.classList.add("is-selected");
          }

          pileEl.append(cardEl);
        });

        pileEl.style.height = `${getPileHeight(pile)}px`;
      });
    }

    function render() {
      renderStock();
      renderWaste();
      renderFoundations();
      renderTableau();
      updateStats();
    }

    function createCardElement(card, meta) {
      const cardEl = document.createElement("button");
      cardEl.type = "button";
      cardEl.className = `solitaire-card ${card.faceUp ? "is-face-up" : "is-face-down"} is-${card.color}`;
      cardEl.dataset.solitaireSource = meta.source;

      if (meta.pile !== undefined) {
        cardEl.dataset.pile = String(meta.pile);
      }
      if (meta.index !== undefined) {
        cardEl.dataset.index = String(meta.index);
      }
      if (meta.suit) {
        cardEl.dataset.suit = meta.suit;
      }

      if (card.faceUp) {
        cardEl.innerHTML = `
          <span class="solitaire-card__corner solitaire-card__corner--top"><span>${card.label}</span><span>${card.suitSymbol}</span></span>
          <span class="solitaire-card__suit">${card.suitSymbol}</span>
          <span class="solitaire-card__corner solitaire-card__corner--bottom"><span>${card.label}</span><span>${card.suitSymbol}</span></span>
        `;
        cardEl.setAttribute("aria-label", `${card.label} de ${getSuitName(card.suit)}`);
      } else {
        cardEl.setAttribute("aria-label", "Carta virada");
      }

      return cardEl;
    }

    function getSuitName(suitId) {
      const suit = suits.find((item) => item.id === suitId);
      return suit ? suit.name : suitId;
    }

    function configureFoundationSlots() {
      elements.foundations.forEach((foundationEl, index) => {
        const suitId = foundationDisplayOrder[index];

        if (!suitId) {
          return;
        }

        foundationEl.dataset.suit = suitId;
        foundationEl.setAttribute("aria-label", `Fundação de ${getSuitName(suitId).toLowerCase()}`);
      });
    }

    function isCardSelected(pileIndex, cardIndex) {
      if (!state.selected || state.selected.source !== "tableau") {
        return false;
      }

      return state.selected.pileIndex === pileIndex && cardIndex >= state.selected.cardIndex;
    }

    function getSelectedCards() {
      if (!state.selected) {
        return [];
      }

      if (state.selected.source === "tableau") {
        return state.tableau[state.selected.pileIndex].slice(state.selected.cardIndex);
      }

      if (state.selected.source === "waste") {
        return state.waste.length ? [state.waste[state.waste.length - 1]] : [];
      }

      if (state.selected.source === "foundation") {
        const pile = state.foundations[state.selected.suit];
        return pile.length ? [pile[pile.length - 1]] : [];
      }

      return [];
    }

    function removeSelectedCards() {
      if (!state.selected) {
        return [];
      }

      if (state.selected.source === "tableau") {
        return state.tableau[state.selected.pileIndex].splice(state.selected.cardIndex);
      }

      if (state.selected.source === "waste") {
        return state.waste.length ? [state.waste.pop()] : [];
      }

      if (state.selected.source === "foundation") {
        const pile = state.foundations[state.selected.suit];
        return pile.length ? [pile.pop()] : [];
      }

      return [];
    }

    function clearSelection() {
      state.selected = null;
    }

    function revealTopCard(pileIndex) {
      const pile = state.tableau[pileIndex];

      if (!pile.length) {
        return;
      }

      const top = pile[pile.length - 1];

      if (!top.faceUp) {
        top.faceUp = true;
      }
    }

    function canMoveToTableau(cards, destPile) {
      const first = cards[0];

      if (!first) {
        return false;
      }

      if (!destPile.length) {
        return first.rank === 13;
      }

      const top = destPile[destPile.length - 1];

      if (!top.faceUp) {
        return false;
      }

      const colorMatch = state.difficulty === "easy" || top.color !== first.color;
      return top.rank === first.rank + 1 && colorMatch;
    }

    function canMoveToFoundation(card, suitId) {
      const pile = state.foundations[suitId];

      if (!pile || card.suit !== suitId) {
        return false;
      }

      if (!pile.length) {
        return card.rank === 1;
      }

      const top = pile[pile.length - 1];
      return card.rank === top.rank + 1;
    }

    function tryMoveToTableau(destIndex) {
      const cards = getSelectedCards();

      if (!cards.length) {
        return false;
      }

      if (state.selected.source === "tableau" && state.selected.pileIndex === destIndex) {
        clearSelection();
        return false;
      }

      if (!canMoveToTableau(cards, state.tableau[destIndex])) {
        setStatus("Movimento inválido.");
        return false;
      }

      pushHistory();
      const moved = removeSelectedCards();
      state.tableau[destIndex].push(...moved);

      if (state.selected.source === "tableau") {
        revealTopCard(state.selected.pileIndex);
      }

      state.moves += 1;
      clearSelection();
      checkWin();
      return true;
    }

    function tryMoveToFoundation(suitId) {
      const cards = getSelectedCards();

      if (cards.length !== 1) {
        setStatus("Somente uma carta pode ir à fundação.");
        return false;
      }

      const card = cards[0];

      if (!canMoveToFoundation(card, suitId)) {
        setStatus("Movimento inválido.");
        return false;
      }

      pushHistory();
      removeSelectedCards();
      state.foundations[suitId].push(card);

      if (state.selected.source === "tableau") {
        revealTopCard(state.selected.pileIndex);
      }

      state.moves += 1;
      clearSelection();
      checkWin();
      return true;
    }

    function drawFromStock() {
      if (state.stock.length) {
        pushHistory();
        const card = state.stock.pop();
        card.faceUp = true;
        state.waste.push(card);
        state.moves += 1;
        clearSelection();
        return;
      }

      if (!state.waste.length) {
        setStatus("Sem cartas para comprar.");
        return;
      }

      pushHistory();
      state.stock = state.waste.reverse().map((card) => ({
        ...card,
        faceUp: false,
      }));
      state.waste = [];
      state.moves += 1;
      clearSelection();
    }

    function handleCardClick(cardEl) {
      const source = cardEl.dataset.solitaireSource;

      if (source === "tableau") {
        const pileIndex = Number(cardEl.dataset.pile);
        const cardIndex = Number(cardEl.dataset.index);
        const card = state.tableau[pileIndex][cardIndex];

        if (!card.faceUp) {
          if (cardIndex === state.tableau[pileIndex].length - 1) {
            pushHistory();
            card.faceUp = true;
            state.moves += 1;
            clearSelection();
            setStatus("Carta revelada.");
          } else {
            setStatus("Essa carta ainda está fechada.");
          }
          return;
        }

        if (state.selected && tryMoveToTableau(pileIndex)) {
          return;
        }

        state.selected = { source: "tableau", pileIndex, cardIndex };
        return;
      }

      if (source === "waste") {
        if (state.selected && state.selected.source !== "waste") {
          setStatus("O descarte só pode mover cartas para o tableau ou fundações.");
        }

        state.selected = { source: "waste" };
        return;
      }

      if (source === "foundation") {
        const suitId = cardEl.dataset.suit;

        if (state.selected) {
          tryMoveToFoundation(suitId);
          return;
        }

        state.selected = { source: "foundation", suit: suitId };
      }
    }

    function handlePileClick(pileEl) {
      const pileType = pileEl.dataset.solitairePile;

      if (pileType === "stock") {
        drawFromStock();
        return;
      }

      if (pileType === "tableau") {
        if (state.selected) {
          tryMoveToTableau(Number(pileEl.dataset.index));
        } else {
          setStatus("Apenas Reis podem ocupar espaços vazios.");
        }
        return;
      }

      if (pileType === "foundation" && state.selected) {
        tryMoveToFoundation(pileEl.dataset.suit);
      }
    }

    function findAutoFoundationMove(card) {
      if (!card || !canMoveToFoundation(card, card.suit)) {
        return null;
      }

      return card.suit;
    }

    function handleDoubleClick(cardEl) {
      const source = cardEl.dataset.solitaireSource;

      if (source === "waste") {
        const card = state.waste[state.waste.length - 1];
        const suitId = findAutoFoundationMove(card);

        if (suitId) {
          state.selected = { source: "waste" };
          tryMoveToFoundation(suitId);
        }
        return;
      }

      if (source !== "tableau") {
        return;
      }

      const pileIndex = Number(cardEl.dataset.pile);
      const cardIndex = Number(cardEl.dataset.index);
      const pile = state.tableau[pileIndex];

      if (cardIndex !== pile.length - 1) {
        return;
      }

      const card = pile[pile.length - 1];
      const suitId = findAutoFoundationMove(card);

      if (suitId) {
        state.selected = { source: "tableau", pileIndex, cardIndex };
        tryMoveToFoundation(suitId);
      }
    }

    function checkWin() {
      const won = suits.every((suit) => state.foundations[suit.id].length === 13);

      if (!won) {
        return;
      }

      stopTimer();
      state.wins += 1;
      writeStorage("klondike_wins", String(state.wins));
      updateStats();
      showOverlay();
    }

    function showOverlay() {
      uiState.lastFocusedEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      elements.overlay.classList.add("is-visible");
      elements.overlay.setAttribute("aria-hidden", "false");
      elements.playAgain.focus();
    }

    function hideOverlay() {
      elements.overlay.classList.remove("is-visible");
      elements.overlay.setAttribute("aria-hidden", "true");

      if (uiState.lastFocusedEl && document.contains(uiState.lastFocusedEl)) {
        uiState.lastFocusedEl.focus();
      }

      uiState.lastFocusedEl = null;
    }

    function showHint() {
      if (state.stock.length) {
        setStatus("Dica: compre uma carta no monte.");
        return;
      }

      const faceDownIndex = state.tableau.findIndex((pile) => pile.length && !pile[pile.length - 1].faceUp);

      if (faceDownIndex !== -1) {
        setStatus(`Dica: vire a carta da coluna ${faceDownIndex + 1}.`);
        return;
      }

      if (state.waste.length) {
        const card = state.waste[state.waste.length - 1];

        if (canMoveToFoundation(card, card.suit)) {
          setStatus(`Dica: envie ${card.label} de ${getSuitName(card.suit)} para a fundação.`);
          return;
        }

        for (let index = 0; index < state.tableau.length; index += 1) {
          if (canMoveToTableau([card], state.tableau[index])) {
            setStatus(`Dica: mova ${card.label} de ${getSuitName(card.suit)} para a coluna ${index + 1}.`);
            return;
          }
        }
      }

      for (let sourceIndex = 0; sourceIndex < state.tableau.length; sourceIndex += 1) {
        const pile = state.tableau[sourceIndex];

        for (let cardIndex = 0; cardIndex < pile.length; cardIndex += 1) {
          const card = pile[cardIndex];

          if (!card.faceUp) {
            continue;
          }

          if (cardIndex === pile.length - 1 && canMoveToFoundation(card, card.suit)) {
            setStatus(`Dica: envie ${card.label} de ${getSuitName(card.suit)} para a fundação.`);
            return;
          }

          for (let destIndex = 0; destIndex < state.tableau.length; destIndex += 1) {
            if (destIndex === sourceIndex) {
              continue;
            }

            if (canMoveToTableau(pile.slice(cardIndex), state.tableau[destIndex])) {
              setStatus(`Dica: mova a sequência começando em ${card.label}.`);
              return;
            }
          }
        }
      }

      setStatus("Sem movimentos evidentes.");
    }

    function getCardInfoFromElement(cardEl) {
      const source = cardEl.dataset.solitaireSource;

      if (!source) {
        return null;
      }

      if (source === "tableau") {
        const pileIndex = Number(cardEl.dataset.pile);
        const cardIndex = Number(cardEl.dataset.index);
        const card = state.tableau[pileIndex] && state.tableau[pileIndex][cardIndex];
        return card ? { source, pileIndex, cardIndex, card } : null;
      }

      if (source === "waste") {
        const card = state.waste[state.waste.length - 1];
        return card ? { source, card } : null;
      }

      if (source === "foundation") {
        const suit = cardEl.dataset.suit;
        const pile = state.foundations[suit];
        const card = pile && pile[pile.length - 1];
        return card ? { source, suit, card } : null;
      }

      return null;
    }

    function buildSelectionFromInfo(info) {
      if (!info) {
        return null;
      }

      if (info.source === "tableau") {
        return { source: "tableau", pileIndex: info.pileIndex, cardIndex: info.cardIndex };
      }

      if (info.source === "waste") {
        return { source: "waste" };
      }

      if (info.source === "foundation") {
        return { source: "foundation", suit: info.suit };
      }

      return null;
    }

    function getDragCards(info) {
      if (!info) {
        return [];
      }

      if (info.source === "tableau") {
        return state.tableau[info.pileIndex].slice(info.cardIndex);
      }

      if (info.source === "waste") {
        return state.waste.length ? [state.waste[state.waste.length - 1]] : [];
      }

      if (info.source === "foundation") {
        const pile = state.foundations[info.suit];
        return pile.length ? [pile[pile.length - 1]] : [];
      }

      return [];
    }

    function ensureDragLayer() {
      if (!dragState.dragLayer) {
        dragState.dragLayer = document.createElement("div");
        dragState.dragLayer.className = "solitaire-drag-layer";
      }

      if (!dragState.dragLayer.parentNode) {
        document.body.append(dragState.dragLayer);
      }
    }

    function buildDragCard(card) {
      const cardEl = document.createElement("div");
      cardEl.className = `solitaire-card is-face-up is-${card.color}`;
      cardEl.setAttribute("aria-hidden", "true");
      cardEl.innerHTML = `
        <span class="solitaire-card__corner solitaire-card__corner--top"><span>${card.label}</span><span>${card.suitSymbol}</span></span>
        <span class="solitaire-card__suit">${card.suitSymbol}</span>
        <span class="solitaire-card__corner solitaire-card__corner--bottom"><span>${card.label}</span><span>${card.suitSymbol}</span></span>
      `;
      return cardEl;
    }

    function markSourceCardsHidden(info) {
      dragState.sourceCardEls = [];

      if (!info) {
        return;
      }

      if (info.source === "tableau") {
        const pileEl = elements.tableau[info.pileIndex];

        if (!pileEl) {
          return;
        }

        dragState.sourceCardEls = Array.from(pileEl.querySelectorAll("[data-solitaire-source]")).filter(
          (element) => Number(element.dataset.index) >= info.cardIndex,
        );
      } else if (info.source === "waste") {
        const cardEl = elements.waste.querySelector("[data-solitaire-source]");

        if (cardEl) {
          dragState.sourceCardEls = [cardEl];
        }
      } else if (info.source === "foundation") {
        const foundationEl = elements.foundations.find((element) => element.dataset.suit === info.suit);
        const cardEl = foundationEl ? foundationEl.querySelector("[data-solitaire-source]") : null;

        if (cardEl) {
          dragState.sourceCardEls = [cardEl];
        }
      }

      for (const cardEl of dragState.sourceCardEls) {
        cardEl.classList.add("is-drag-hidden");
      }
    }

    function clearDragArtifacts() {
      for (const cardEl of dragState.sourceCardEls) {
        cardEl.classList.remove("is-drag-hidden");
      }

      dragState.sourceCardEls = [];

      if (dragState.dragStack) {
        dragState.dragStack.remove();
      }

      dragState.dragStack = null;
    }

    function beginDrag(event) {
      const info = dragState.sourceInfo;
      const cards = getDragCards(info);

      if (!cards.length) {
        dragState.pending = false;
        return;
      }

      dragState.active = true;
      dragState.pending = false;
      ensureDragLayer();
      dragState.dragStack = document.createElement("div");
      dragState.dragStack.className = "solitaire-drag-stack";

      const offset = getOffsetUp();

      cards.forEach((card, index) => {
        const cardEl = buildDragCard(card);
        cardEl.style.top = `${index * offset}px`;
        cardEl.style.left = "0";
        cardEl.style.zIndex = String(index + 1);
        dragState.dragStack.append(cardEl);
      });

      dragState.dragLayer.append(dragState.dragStack);

      const rect = dragState.sourceEl.getBoundingClientRect();
      dragState.offsetX = event.clientX - rect.left;
      dragState.offsetY = event.clientY - rect.top;
      root.querySelectorAll(".solitaire-card.is-selected").forEach((element) => element.classList.remove("is-selected"));
      clearSelection();
      markSourceCardsHidden(info);
      updateDragPosition(event.clientX, event.clientY);
    }

    function updateDragPosition(x, y) {
      if (!dragState.dragStack) {
        return;
      }

      dragState.dragStack.style.left = `${x - dragState.offsetX}px`;
      dragState.dragStack.style.top = `${y - dragState.offsetY}px`;
    }

    function attemptDrop(pileEl) {
      if (!pileEl || !dragState.sourceInfo) {
        return false;
      }

      const pileType = pileEl.dataset.solitairePile;
      const selection = buildSelectionFromInfo(dragState.sourceInfo);

      if (!selection) {
        return false;
      }

      state.selected = selection;
      let moved = false;

      if (pileType === "tableau") {
        moved = tryMoveToTableau(Number(pileEl.dataset.index));
      } else if (pileType === "foundation") {
        moved = tryMoveToFoundation(pileEl.dataset.suit);
      }

      if (!moved) {
        clearSelection();
      }

      return moved;
    }

    function endDrag() {
      clearDragArtifacts();
      dragState.active = false;
      dragState.pending = false;
      dragState.pointerId = null;
      dragState.sourceInfo = null;
      dragState.sourceEl = null;
    }

    function hasRequiredElements() {
      return Boolean(
        elements.stock
          && elements.waste
          && elements.timer
          && elements.moves
          && elements.wins
          && elements.status
          && elements.undo
          && elements.newGame
          && elements.hint
          && elements.difficulty
          && elements.overlay
          && elements.playAgain
          && elements.foundations.length === 4
          && elements.tableau.length === 7,
      );
    }

    function handlePileActivation(pileEl) {
      if (!pileEl) {
        return;
      }

      if (pileEl.dataset.solitairePile === "stock") {
        drawFromStock();
        render();
        return;
      }

      handlePileClick(pileEl);
      render();
    }

    configureFoundationSlots();

    root.addEventListener("pointerdown", (event) => {
      const cardEl = event.target.closest(".solitaire-card");

      if (!cardEl || event.button !== 0) {
        return;
      }

      const info = getCardInfoFromElement(cardEl);

      if (!info || !info.card || !info.card.faceUp) {
        return;
      }

      dragState.pending = true;
      dragState.pointerId = event.pointerId;
      dragState.startX = event.clientX;
      dragState.startY = event.clientY;
      dragState.sourceInfo = info;
      dragState.sourceEl = cardEl;
      dragState.justDragged = false;
    });

    document.addEventListener(
      "pointermove",
      (event) => {
        if ((!dragState.pending && !dragState.active) || event.pointerId !== dragState.pointerId) {
          return;
        }

        const dx = event.clientX - dragState.startX;
        const dy = event.clientY - dragState.startY;
        const distance = Math.hypot(dx, dy);

        if (dragState.pending && distance > 6) {
          beginDrag(event);
        }

        if (dragState.active) {
          event.preventDefault();
          updateDragPosition(event.clientX, event.clientY);
        }
      },
      { passive: false },
    );

    document.addEventListener("pointerup", (event) => {
      if (event.pointerId !== dragState.pointerId) {
        return;
      }

      if (dragState.pending) {
        dragState.pending = false;
        dragState.pointerId = null;
        return;
      }

      if (!dragState.active) {
        return;
      }

      event.preventDefault();

      const target = document.elementFromPoint(event.clientX, event.clientY);
      const pileEl = target ? target.closest(".solitaire-pile") : null;
      attemptDrop(pileEl);
      endDrag();
      render();
      dragState.justDragged = true;
      window.setTimeout(() => {
        dragState.justDragged = false;
      }, 0);
    });

    document.addEventListener("pointercancel", (event) => {
      if (event.pointerId !== dragState.pointerId) {
        return;
      }

      if (dragState.active) {
        endDrag();
        render();
      }

      dragState.pending = false;
      dragState.pointerId = null;
    });

    root.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && elements.overlay.classList.contains("is-visible")) {
        event.preventDefault();
        hideOverlay();
        return;
      }

      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      const target = event.target;

      if (!(target instanceof HTMLElement) || target.closest(".solitaire-card")) {
        return;
      }

      const pileEl = target.closest(".solitaire-pile");

      if (!pileEl) {
        return;
      }

      event.preventDefault();
      handlePileActivation(pileEl);
    });

    root.addEventListener("click", (event) => {
      if (dragState.justDragged) {
        dragState.justDragged = false;
        return;
      }

      const cardEl = event.target.closest(".solitaire-card");
      const pileEl = event.target.closest(".solitaire-pile");

      if (!pileEl) {
        clearSelection();
        render();
        return;
      }

      if (pileEl.dataset.solitairePile === "stock") {
        handlePileActivation(pileEl);
        return;
      }

      if (cardEl) {
        handleCardClick(cardEl);
        render();
        return;
      }

      handlePileActivation(pileEl);
    });

    root.addEventListener("dblclick", (event) => {
      if (dragState.justDragged) {
        dragState.justDragged = false;
        return;
      }

      const cardEl = event.target.closest(".solitaire-card");

      if (!cardEl) {
        return;
      }

      handleDoubleClick(cardEl);
      render();
    });

    elements.undo.addEventListener("click", undoMove);
    elements.newGame.addEventListener("click", startNewGame);
    elements.hint.addEventListener("click", showHint);
    elements.playAgain.addEventListener("click", startNewGame);
    elements.difficulty.addEventListener("change", (event) => {
      state.difficulty = event.target.value === "easy" ? "easy" : "hard";
      writeStorage("klondike_difficulty", state.difficulty);
      syncDifficultyUI();
      startNewGame();
      setStatus(`Dificuldade ${getDifficultyLabel()} ativada.`);
    });

    window.addEventListener("resize", () => {
      refreshLayoutMetrics();
      render();
    });
    window.addEventListener("pagehide", stopTimer, { once: true });

    syncDifficultyUI();
    updateUndoButton();
    updateStats();
    startNewGame();
  }

  function setupNotesWall() {
    const wall = document.querySelector("[data-notes-wall]");

    if (!wall) {
      return;
    }

    const cards = Array.from(wall.querySelectorAll("[data-note-card]"));
    const filterButtons = Array.from(wall.querySelectorAll("[data-note-filter]"));
    const countLabel = wall.querySelector("[data-notes-count-label]");
    const emptyState = wall.querySelector("[data-notes-empty]");
    const pagination = wall.querySelector("[data-notes-pagination]");
    const perPage = Number.parseInt(wall.dataset.notesPerPage || "21", 10) || 21;

    if (cards.length === 0 || filterButtons.length === 0) {
      return;
    }

    const state = {
      tag: "all",
      page: 1,
    };

    const filteredCards = () => {
      if (state.tag === "all") {
        return cards;
      }
      return cards.filter((card) => card.dataset.tag === state.tag);
    };

    const setActiveFilter = () => {
      for (const button of filterButtons) {
        const active = button.dataset.noteFilter === state.tag;
        button.classList.toggle("is-active", active);
        if (active) {
          button.setAttribute("aria-current", "true");
        } else {
          button.removeAttribute("aria-current");
        }
      }
    };

    const renderPagination = (totalPages) => {
      if (!pagination) {
        return;
      }

      pagination.textContent = "";
      if (totalPages <= 1) {
        return;
      }

      const addButton = (label, page, options = {}) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.disabled = Boolean(options.disabled);
        button.classList.toggle("is-active", Boolean(options.active));
        if (options.active) {
          button.setAttribute("aria-current", "page");
        }
        button.addEventListener("click", () => {
          state.page = page;
          render();
        });
        pagination.append(button);
      };

      addButton("Anterior", Math.max(1, state.page - 1), { disabled: state.page === 1 });
      for (let page = 1; page <= totalPages; page += 1) {
        addButton(String(page), page, { active: page === state.page });
      }
      addButton("Próxima", Math.min(totalPages, state.page + 1), { disabled: state.page === totalPages });
    };

    const render = () => {
      const visible = filteredCards();
      const totalPages = Math.max(1, Math.ceil(visible.length / perPage));
      state.page = Math.min(Math.max(state.page, 1), totalPages);

      const start = (state.page - 1) * perPage;
      const pageCards = new Set(visible.slice(start, start + perPage));

      for (const card of cards) {
        setHidden(card, !pageCards.has(card));
      }

      if (countLabel) {
        countLabel.textContent = `Mostrando ${visible.length} de ${cards.length} bilhetes.`;
      }

      if (emptyState) {
        setHidden(emptyState, visible.length !== 0);
      }

      setActiveFilter();
      renderPagination(totalPages);
    };

    for (const button of filterButtons) {
      button.addEventListener("click", () => {
        state.tag = button.dataset.noteFilter || "all";
        state.page = 1;
        render();
      });
    }

    render();
  }

  function setupArticleTOC() {
    const tocRoots = Array.from(document.querySelectorAll("[data-article-toc]"));

    if (tocRoots.length === 0) {
      return;
    }

    const firstTarget = tocRoots[0].dataset.target;
    const article = firstTarget ? document.querySelector(firstTarget) : null;
    if (!article) {
      return;
    }

    const headings = Array.from(article.querySelectorAll("h2, h3")).filter((heading) => heading.id);
    if (headings.length === 0) {
      return;
    }

    const links = [];
    for (const root of tocRoots) {
      const nav = root.querySelector("nav");
      if (!nav) {
        continue;
      }

      const list = document.createElement("ul");
      for (const heading of headings) {
        const item = document.createElement("li");
        const link = document.createElement("a");
        link.href = `#${heading.id}`;
        link.textContent = heading.textContent.trim();
        link.dataset.level = heading.tagName === "H2" ? "2" : "3";
        item.append(link);
        list.append(item);
        links.push(link);
      }
      nav.append(list);
    }

    const setActive = (id) => {
      for (const link of links) {
        link.classList.toggle("is-active", link.hash === `#${id}`);
      }
    };

    if (!("IntersectionObserver" in window)) {
      setActive(headings[0].id);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(entry.target.id);
          }
        }
      },
      { rootMargin: "0px 0px -70% 0px", threshold: 0.1 },
    );

    for (const heading of headings) {
      observer.observe(heading);
    }
    setActive(headings[0].id);
  }

  function setupArticleCodeCopy() {
    const article = document.querySelector("#article-content .prose");

    if (!article || !navigator.clipboard) {
      return;
    }

    const pres = Array.from(article.querySelectorAll("pre"));
    for (const pre of pres) {
      if (pre.querySelector('[data-copy="btn"]')) {
        continue;
      }

      const button = document.createElement("button");
      button.type = "button";
      button.dataset.copy = "btn";
      button.textContent = "Copiar";
      pre.append(button);

      button.addEventListener("click", async () => {
        const code = pre.querySelector("code")?.textContent || "";
        try {
          await navigator.clipboard.writeText(code);
          button.textContent = "Copiado!";
        } catch {
          button.textContent = "Falhou";
        }
        window.setTimeout(() => {
          button.textContent = "Copiar";
        }, 1500);
      });
    }
  }

  function setupBlogSearch(browser) {
    const form = browser.querySelector("[data-blog-search-form]");
    const input = browser.querySelector("[data-blog-search-input]");
    const results = browser.querySelector("[data-blog-search-results]");
    const cards = Array.from(browser.querySelectorAll("[data-blog-card]"));

    if (!form || !input || !results) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    input.value = params.get("q") || "";

    const normalize = (value) =>
      value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("pt-BR");

    const renderSearch = () => {
      const query = input.value.trim();
      results.textContent = "";

      if (!query) {
        setHidden(results, true);
        return;
      }

      const needle = normalize(query);
      const matches = cards
        .filter((card) => normalize(card.dataset.search || card.textContent || "").includes(needle))
        .slice(0, 10);

      if (matches.length === 0) {
        const empty = document.createElement("p");
        empty.textContent = `Nenhum resultado para "${query}".`;
        results.append(empty);
      } else {
        const list = document.createElement("ul");
        for (const card of matches) {
          const item = document.createElement("li");
          const link = document.createElement("a");
          link.href = card.dataset.url || card.getAttribute("href") || "#";
          link.textContent = card.dataset.title || card.textContent.trim();
          item.append(link);
          list.append(item);
        }
        results.append(list);
      }

      setHidden(results, false);
    };

    input.addEventListener("input", renderSearch);

    form.addEventListener("submit", (event) => {
      event.preventDefault();

      const nextParams = new URLSearchParams(window.location.search);
      const query = input.value.trim();
      if (query) {
        nextParams.set("q", query);
      } else {
        nextParams.delete("q");
      }

      const search = nextParams.toString();
      const nextURL = `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`;
      window.history.replaceState(null, "", nextURL);
      renderSearch();
    });

    window.addEventListener("popstate", () => {
      const nextParams = new URLSearchParams(window.location.search);
      input.value = nextParams.get("q") || "";
      renderSearch();
    });

    renderSearch();
  }

  function setupBlogFilters(browser) {
    const groups = Array.from(browser.querySelectorAll("[data-blog-group]"));
    const allButton = browser.querySelector("[data-blog-filter-all]");
    const yearButton = browser.querySelector("[data-blog-filter-year]");
    const yearSelect = browser.querySelector("[data-blog-year-select]");
    const monthButtons = Array.from(browser.querySelectorAll("[data-blog-filter-month]"));
    const activeLabel = browser.querySelector("[data-blog-active-label]");
    const emptyFilter = browser.querySelector("[data-blog-empty-filter]");

    if (!allButton || !yearButton || !yearSelect) {
      return;
    }

    const state = {
      mode: "all",
      year: yearSelect.value || "",
      monthId: "",
    };

    const setActive = (element, active) => {
      if (!element) {
        return;
      }

      element.classList.toggle("is-active", active);
      if (active) {
        element.setAttribute("aria-current", "true");
      } else {
        element.removeAttribute("aria-current");
      }
    };

    const currentMonthLabel = () => {
      const activeMonth = monthButtons.find((button) => button.dataset.monthId === state.monthId);
      return activeMonth?.dataset.label || "Filtro ativo";
    };

    const updateMonthButtons = () => {
      for (const button of monthButtons) {
        setHidden(button, button.dataset.year !== state.year);
      }
    };

    const applyFilter = () => {
      let visibleGroups = 0;

      for (const group of groups) {
        let visible = true;

        if (state.mode === "year") {
          visible = group.dataset.year === state.year;
        } else if (state.mode === "month") {
          visible = group.dataset.monthId === state.monthId;
        }

        setHidden(group, !visible);
        if (visible) {
          visibleGroups += 1;
        }
      }

      if (emptyFilter) {
        setHidden(emptyFilter, visibleGroups !== 0);
      }

      if (activeLabel) {
        if (state.mode === "all") {
          activeLabel.textContent = "Mostrando todos os textos";
        } else if (state.mode === "year") {
          activeLabel.textContent = `Ano ${state.year}`;
        } else {
          activeLabel.textContent = currentMonthLabel();
        }
      }

      setActive(allButton, state.mode === "all");
      setActive(yearButton, state.mode === "year");

      for (const button of monthButtons) {
        setActive(button, state.mode === "month" && button.dataset.monthId === state.monthId);
      }

      updateMonthButtons();
    };

    allButton.addEventListener("click", () => {
      state.mode = "all";
      state.year = yearSelect.value || state.year;
      state.monthId = "";
      applyFilter();
    });

    yearButton.addEventListener("click", () => {
      state.mode = "year";
      state.year = yearSelect.value || state.year;
      state.monthId = "";
      applyFilter();
    });

    yearSelect.addEventListener("change", () => {
      state.mode = "year";
      state.year = yearSelect.value;
      state.monthId = "";
      applyFilter();
    });

    for (const button of monthButtons) {
      button.addEventListener("click", () => {
        state.mode = "month";
        state.year = button.dataset.year || state.year;
        state.monthId = button.dataset.monthId || "";
        yearSelect.value = state.year;
        applyFilter();
      });
    }

    applyFilter();
  }

  setupFooterSecret();
  setupNotFoundPath();
  setupSpotifyEmbeds();
  setupBlogBrowser();
  setupProjectsCatalog();
  setupGames();
  setupNotesWall();
  setupArticleCodeCopy();
  setupArticleTOC();
})();
