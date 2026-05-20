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
