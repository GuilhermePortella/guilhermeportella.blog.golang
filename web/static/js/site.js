(() => {
  const siteBasePath = getSiteBasePath();

  function getSiteBasePath() {
    const script = document.currentScript;

    if (!script) {
      return "";
    }

    try {
      const source = new URL(script.src, window.location.href);
      const marker = "/static/js/site.js";
      const markerIndex = source.pathname.lastIndexOf(marker);

      if (markerIndex <= 0) {
        return "";
      }

      return source.pathname.slice(0, markerIndex);
    } catch {
      return "";
    }
  }

  function setHidden(element, hidden) {
    if (!element) {
      return;
    }

    element.hidden = hidden;
    element.classList.toggle("is-hidden", hidden);
  }

  function setupNotFoundPath() {
    const pathLabel = document.querySelector("[data-not-found-path]");

    if (!pathLabel) {
      return;
    }

    pathLabel.textContent = window.location.pathname || "/";
  }

  function setupErrorPage() {
    const title = document.querySelector("[data-error-title]");

    if (!title) {
      return;
    }

    const label = document.querySelector("[data-error-label]");
    const leadPrefix = document.querySelector("[data-error-lead-prefix]");
    const leadSuffix = document.querySelector("[data-error-lead-suffix]");
    const note = document.querySelector("[data-error-note]");
    const pathLabel = document.querySelector("[data-error-path]");
    const code = document.querySelector("[data-error-code]");
    const retry = document.querySelector("[data-error-retry]");

    if (pathLabel) {
      pathLabel.textContent = window.location.pathname || "/";
    }

    if (retry) {
      retry.addEventListener("click", () => {
        window.location.reload();
      });
    }

    function applyConnectionState() {
      if (navigator.onLine !== false) {
        return;
      }

      if (label) {
        label.textContent = "sem conexão";
      }
      title.textContent = "Parece que sua internet caiu.";
      if (leadPrefix) {
        leadPrefix.textContent = "Tentei abrir ";
      }
      if (leadSuffix) {
        leadSuffix.textContent = ", mas o navegador não conseguiu conversar com a rede agora.";
      }
      if (note) {
        note.textContent = "Quando a conexão voltar, tente novamente. Enquanto isso, páginas já visitadas podem continuar disponíveis pelo cache.";
      }
      if (code) {
        code.textContent = "OFF";
      }
    }

    applyConnectionState();
    window.addEventListener("offline", applyConnectionState);
  }

  function setupServiceWorker() {
    if (!("serviceWorker" in navigator) || window.location.protocol === "file:") {
      return;
    }

    const scope = siteBasePath === "" ? "/" : `${siteBasePath}/`;
    const serviceWorkerURL = `${siteBasePath}/service-worker.js`;

    navigator.serviceWorker.register(serviceWorkerURL, { scope }).catch(() => {});
  }

  function setupSpotifyEmbeds() {
    const embeds = Array.from(document.querySelectorAll("[data-spotify-embed]"));

    if (embeds.length === 0) {
      return;
    }

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

  function setupRickAndMortyPortal() {
    const root = document.querySelector("[data-rick-and-morty]");

    if (!root) {
      return;
    }

    const apiBase = (root.dataset.rickApiBase || "https://rickandmortyapi.com/api").replace(/\/$/, "");
    const form = root.querySelector("[data-rick-form]");
    const nameInput = root.querySelector("[data-rick-name]");
    const statusSelect = root.querySelector("[data-rick-status]");
    const randomButton = root.querySelector("[data-rick-random]");
    const prevButton = root.querySelector("[data-rick-prev]");
    const nextButton = root.querySelector("[data-rick-next]");
    const pageLabel = root.querySelector("[data-rick-page-label]");
    const message = root.querySelector("[data-rick-message]");
    const grid = root.querySelector("[data-rick-grid]");
    const spotlight = root.querySelector("[data-rick-spotlight]");

    if (!form || !nameInput || !statusSelect || !randomButton || !prevButton || !nextButton || !pageLabel || !message || !grid || !spotlight) {
      return;
    }

    const controller = new AbortController();
    window.addEventListener("pagehide", () => controller.abort(), { once: true });

    const state = {
      page: 1,
      pages: 1,
      name: "",
      status: "",
      totalCharacters: 826,
      loading: false,
      localSelection: false,
    };

    const fallbackCharacters = [
      {
        id: 1,
        name: "Rick Sanchez",
        status: "Alive",
        species: "Human",
        gender: "Male",
        origin: { name: "Earth (C-137)" },
        location: { name: "Citadel of Ricks" },
        image: "https://rickandmortyapi.com/api/character/avatar/1.jpeg",
        episodeCount: 51,
        url: "https://rickandmortyapi.com/api/character/1",
      },
      {
        id: 2,
        name: "Morty Smith",
        status: "Alive",
        species: "Human",
        gender: "Male",
        origin: { name: "Earth (C-137)" },
        location: { name: "Earth (Replacement Dimension)" },
        image: "https://rickandmortyapi.com/api/character/avatar/2.jpeg",
        episodeCount: 51,
        url: "https://rickandmortyapi.com/api/character/2",
      },
      {
        id: 3,
        name: "Summer Smith",
        status: "Alive",
        species: "Human",
        gender: "Female",
        origin: { name: "Earth (Replacement Dimension)" },
        location: { name: "Earth (Replacement Dimension)" },
        image: "https://rickandmortyapi.com/api/character/avatar/3.jpeg",
        episodeCount: 42,
        url: "https://rickandmortyapi.com/api/character/3",
      },
      {
        id: 183,
        name: "Johnny Depp",
        status: "Alive",
        species: "Human",
        gender: "Male",
        origin: { name: "Earth (C-500A)" },
        location: { name: "Earth (C-500A)" },
        image: "https://rickandmortyapi.com/api/character/avatar/183.jpeg",
        episodeCount: 1,
        url: "https://rickandmortyapi.com/api/character/183",
      },
    ];

    const statusLabels = {
      Alive: "Vivo",
      Dead: "Morto",
      unknown: "Desconhecido",
    };

    const genderLabels = {
      Female: "Feminino",
      Male: "Masculino",
      Genderless: "Sem gênero",
      unknown: "Desconhecido",
    };

    const safeRickURL = (value) => {
      if (!value) {
        return "";
      }

      try {
        const parsed = new URL(value, apiBase);
        if (parsed.protocol !== "https:" || parsed.hostname !== "rickandmortyapi.com") {
          return "";
        }
        return parsed.href;
      } catch {
        return "";
      }
    };

    const setMessage = (kind, text) => {
      message.textContent = text;
      message.classList.toggle("is-error", kind === "error");
      message.classList.toggle("is-empty", kind === "empty");
    };

    const setStat = (key, value) => {
      const element = root.querySelector(`[data-rick-stat="${key}"]`);
      if (!element || !Number.isFinite(value)) {
        return;
      }

      element.textContent = new Intl.NumberFormat("pt-BR").format(value);
    };

    const updateControls = () => {
      prevButton.disabled = state.loading || state.localSelection || state.page <= 1;
      nextButton.disabled = state.loading || state.localSelection || state.page >= state.pages;
      randomButton.disabled = state.loading;
      const submitButton = form.querySelector("button[type='submit']");
      if (submitButton) {
        submitButton.disabled = state.loading;
      }

      if (state.localSelection) {
        pageLabel.textContent = "Seleção";
      } else {
        pageLabel.textContent = `Página ${state.page} de ${state.pages}`;
      }
    };

    const endpointURL = (resource) => `${apiBase}/${resource}`;

    const fetchJSON = async (url) => {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const error = new Error("Rick and Morty API request failed.");
        error.status = response.status;
        throw error;
      }

      return response.json();
    };

    const charactersURL = () => {
      const url = new URL(endpointURL("character"));
      url.searchParams.set("page", String(state.page));

      if (state.name) {
        url.searchParams.set("name", state.name);
      }

      if (state.status) {
        url.searchParams.set("status", state.status);
      }

      return url.href;
    };

    const normalizeCharacter = (character) => ({
      id: character.id,
      name: character.name || "Personagem sem nome",
      status: character.status || "unknown",
      species: character.species || "Espécie desconhecida",
      gender: character.gender || "unknown",
      origin: character.origin?.name || "Origem desconhecida",
      location: character.location?.name || "Local desconhecido",
      image: safeRickURL(character.image),
      episodeCount: Array.isArray(character.episode) ? character.episode.length : Number(character.episodeCount) || 0,
      url: safeRickURL(character.url),
    });

    const statusClass = (status) => {
      const normalized = String(status || "").toLowerCase();
      if (normalized === "alive" || normalized === "dead") {
        return normalized;
      }
      return "unknown";
    };

    const appendMeta = (list, label, value) => {
      const group = document.createElement("div");
      const term = document.createElement("dt");
      const description = document.createElement("dd");

      term.textContent = label;
      description.textContent = value;
      group.append(term, description);
      list.append(group);
    };

    const characterCard = (character) => {
      const card = document.createElement("article");
      card.className = "rick-character";

      const media = document.createElement("div");
      media.className = "rick-character__media";

      if (character.image) {
        const image = document.createElement("img");
        image.src = character.image;
        image.alt = `Retrato de ${character.name}`;
        image.loading = "lazy";
        image.width = 300;
        image.height = 300;
        media.append(image);
      }

      const content = document.createElement("div");
      content.className = "rick-character__content";

      const badge = document.createElement("span");
      badge.className = `rick-status rick-status--${statusClass(character.status)}`;
      badge.textContent = statusLabels[character.status] || "Desconhecido";

      const title = document.createElement("h3");
      title.textContent = character.name;

      const summary = document.createElement("p");
      summary.textContent = `${character.species} · ${genderLabels[character.gender] || character.gender}`;

      const meta = document.createElement("dl");
      meta.className = "rick-character__meta";
      appendMeta(meta, "Origem", character.origin);
      appendMeta(meta, "Último local", character.location);
      appendMeta(meta, "Episódios", String(character.episodeCount));

      content.append(badge, title, summary, meta);

      if (character.url) {
        const link = document.createElement("a");
        link.className = "rick-character__link arrow-shift";
        link.href = character.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.append(document.createTextNode("Ver JSON "));

        const arrow = document.createElement("span");
        arrow.className = "link-arrow";
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = "->";
        link.append(arrow);
        content.append(link);
      }

      card.append(media, content);
      return card;
    };

    const renderSpotlight = (character, localSelection = false) => {
      if (!character) {
        const empty = document.createElement("div");
        empty.className = "rick-spotlight__empty";

        const eyebrow = document.createElement("p");
        eyebrow.className = "curiosity-eyebrow";
        eyebrow.textContent = "destaque";

        const title = document.createElement("h3");
        title.textContent = "Nada encontrado.";

        const copy = document.createElement("p");
        copy.textContent = "Tenta outro nome ou limpa o filtro de status.";

        empty.append(eyebrow, title, copy);
        spotlight.replaceChildren(empty);
        return;
      }

      const article = document.createElement("article");
      article.className = "rick-spotlight__character";

      if (character.image) {
        const image = document.createElement("img");
        image.src = character.image;
        image.alt = `Retrato em destaque de ${character.name}`;
        image.loading = "lazy";
        image.width = 300;
        image.height = 300;
        article.append(image);
      }

      const copy = document.createElement("div");
      const eyebrow = document.createElement("p");
      eyebrow.className = "curiosity-eyebrow";
      eyebrow.textContent = localSelection ? "fallback local" : "destaque";

      const title = document.createElement("h3");
      title.textContent = character.name;

      const text = document.createElement("p");
      text.textContent = `${statusLabels[character.status] || "Desconhecido"} · ${character.species} · ${character.episodeCount} episódios`;

      const location = document.createElement("span");
      location.textContent = character.location;

      copy.append(eyebrow, title, text, location);
      article.append(copy);
      spotlight.replaceChildren(article);
    };

    const renderEmpty = () => {
      const empty = document.createElement("article");
      empty.className = "rick-empty";
      empty.textContent = "Nenhum personagem encontrado com esse filtro.";
      grid.replaceChildren(empty);
      renderSpotlight(null);
    };

    const renderCharacters = (characters, options = {}) => {
      const normalized = characters.map(normalizeCharacter);
      const visible = normalized.slice(0, 8);
      const cards = visible.map(characterCard);

      state.localSelection = Boolean(options.localSelection);
      state.pages = Math.max(1, Number(options.pages) || 1);

      grid.replaceChildren(...cards);
      renderSpotlight(visible[0], state.localSelection);
      updateControls();
    };

    const loadStats = async () => {
      try {
        const [locations, episodes] = await Promise.all([
          fetchJSON(endpointURL("location")),
          fetchJSON(endpointURL("episode")),
        ]);

        setStat("locations", Number(locations?.info?.count));
        setStat("episodes", Number(episodes?.info?.count));
      } catch (error) {
        if (error?.name !== "AbortError") {
          setStat("locations", 126);
          setStat("episodes", 51);
        }
      }
    };

    const loadCharacters = async () => {
      state.loading = true;
      state.localSelection = false;
      setMessage("loading", "Consultando personagens na API.");
      updateControls();

      try {
        const data = await fetchJSON(charactersURL());
        const characters = Array.isArray(data?.results) ? data.results : [];
        const count = Number(data?.info?.count) || characters.length;

        state.totalCharacters = Math.max(count, state.totalCharacters);
        setStat("characters", count);
        renderCharacters(characters, { pages: data?.info?.pages });
        setMessage("success", `${Math.min(characters.length, 8)} destaques desta busca, de ${new Intl.NumberFormat("pt-BR").format(count)} personagens encontrados.`);
      } catch (error) {
        if (error?.name === "AbortError") {
          return;
        }

        if (error?.status === 404) {
          state.pages = 1;
          state.localSelection = false;
          renderEmpty();
          setMessage("empty", "Nenhum personagem encontrado com esse filtro.");
          return;
        }

        state.page = 1;
        renderCharacters(fallbackCharacters, { pages: 1, localSelection: true });
        setMessage("error", "A API não respondeu agora. Mantive uma seleção local para a seção não quebrar.");
      } finally {
        state.loading = false;
        updateControls();
      }
    };

    const loadRandomCharacter = async () => {
      state.loading = true;
      setMessage("loading", "Buscando um personagem aleatório.");
      updateControls();

      const randomId = Math.floor(Math.random() * Math.max(state.totalCharacters, 826)) + 1;

      try {
        const character = await fetchJSON(endpointURL(`character/${randomId}`));
        state.page = 1;
        renderCharacters([character], { pages: 1 });
        setMessage("success", `Personagem aleatório: ${character.name}.`);
      } catch (error) {
        if (error?.name === "AbortError") {
          return;
        }

        const fallback = fallbackCharacters[Math.floor(Math.random() * fallbackCharacters.length)];
        renderCharacters([fallback], { pages: 1, localSelection: true });
        setMessage("error", "Não consegui sortear pela API. Mostrei um favorito local.");
      } finally {
        state.loading = false;
        updateControls();
      }
    };

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      state.page = 1;
      state.name = nameInput.value.trim();
      state.status = statusSelect.value;
      loadCharacters();
    });

    statusSelect.addEventListener("change", () => {
      state.page = 1;
      state.status = statusSelect.value;
      state.name = nameInput.value.trim();
      loadCharacters();
    });

    prevButton.addEventListener("click", () => {
      if (state.page <= 1) {
        return;
      }
      state.page -= 1;
      loadCharacters();
    });

    nextButton.addEventListener("click", () => {
      if (state.page >= state.pages) {
        return;
      }
      state.page += 1;
      loadCharacters();
    });

    randomButton.addEventListener("click", loadRandomCharacter);

    loadStats();
    loadCharacters();
  }

  function setupGames() {
    setupSnakeGame();
    setupMemoryGame();
    setupSequenceGame();
    setupReactionGame();
    setupMathGame();
    setupSolitaireGame();
    setupCheckersGame();
  }

  function setupSnakeGame() {
    const root = document.querySelector("[data-snake-game]");

    if (!root) {
      return;
    }

    const canvas = root.querySelector("[data-snake-canvas]");
    const boardShell = root.querySelector("[data-snake-board-shell]");
    const startPanel = root.querySelector("[data-snake-start-panel]");
    const nameInput = root.querySelector("[data-snake-name]");
    const startButton = root.querySelector("[data-snake-start]");
    const restartButton = root.querySelector("[data-snake-restart]");
    const scoreLabel = root.querySelector("[data-snake-score]");
    const bestLabel = root.querySelector("[data-snake-best]");
    const speedLabel = root.querySelector("[data-snake-speed]");
    const livesContainer = root.querySelector("[data-snake-lives]");
    const status = root.querySelector("[data-snake-status]");

    if (!canvas || !boardShell || !startPanel || !startButton || !scoreLabel || !bestLabel || !speedLabel || !livesContainer || !status) {
      return;
    }

    const context = canvas.getContext("2d");
    const gridSize = 20;
    const initialSnakeLength = 4;
    const initialSpeed = 145;
    const minimumSpeed = 58;
    const extraLifeRecoverySpeed = 115;
    const extraLifeRecoveryDelay = 750;
    const extraLifeRecoveryTicks = 5;
    const extraLifeRespawnMargin = 4;
    const maxLives = 3;
    const lifeMilestones = [50, 100, 150];
    const localBestKey = "snake-classic-best-score";
    const vectors = {
      up: { x: 0, y: -1 },
      down: { x: 0, y: 1 },
      left: { x: -1, y: 0 },
      right: { x: 1, y: 0 },
    };
    const opposite = {
      up: "down",
      down: "up",
      left: "right",
      right: "left",
    };

    const state = {
      snake: [],
      food: { x: 0, y: 0 },
      direction: "right",
      nextDirection: "right",
      playerName: "",
      score: 0,
      bestScore: readBestScore(),
      gameOver: false,
      gameStarted: false,
      scoreSaved: false,
      lives: 0,
      speed: initialSpeed,
      intervalId: null,
      awardedMilestones: [],
      pointerStart: null,
      recoveryUntil: 0,
      recoveryTicks: 0,
    };

    function columns() {
      return Math.floor(canvas.width / gridSize);
    }

    function rows() {
      return Math.floor(canvas.height / gridSize);
    }

    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    }

    function createSnake(length = initialSnakeLength) {
      const colCount = columns();
      const rowCount = rows();
      const playableLength = Math.max(2, Math.min(length, colCount - 2));
      const headX = clamp(Math.floor(colCount / 2), playableLength, Math.max(playableLength, colCount - 2));
      const headY = clamp(Math.floor(rowCount / 2), 1, Math.max(1, rowCount - 2));

      return Array.from({ length: playableLength }, (_, index) => ({
        x: headX - index,
        y: headY,
      }));
    }

    function createExtraLifeSnake(length = initialSnakeLength) {
      const colCount = columns();
      const rowCount = rows();
      const marginX = safeRespawnMargin(colCount);
      const marginY = safeRespawnMargin(rowCount);
      const headX = clamp(Math.floor(colCount / 2), marginX + 1, Math.max(marginX + 1, colCount - marginX - 1));
      const headY = clamp(Math.floor(rowCount / 2), marginY, Math.max(marginY, rowCount - marginY - 1));
      const maxLength = Math.max(2, headX - marginX + 1);
      const playableLength = Math.max(2, Math.min(length, maxLength));

      return Array.from({ length: playableLength }, (_, index) => ({
        x: headX - index,
        y: headY,
      }));
    }

    function safeRespawnMargin(cellCount) {
      return clamp(Math.floor(cellCount * 0.18), 2, extraLifeRespawnMargin);
    }

    function resizeCanvas(force = false) {
      if (state.gameStarted && !state.gameOver && !force) {
        return;
      }

      const shellStyles = getComputedStyle(boardShell);
      const paddingX = Number.parseFloat(shellStyles.paddingLeft || 0) + Number.parseFloat(shellStyles.paddingRight || 0);
      const shellWidth = Math.max(0, boardShell.clientWidth - paddingX);
      const maxBoardSize = 540;
      const minBoardSize = window.innerWidth < 420 ? 220 : 280;
      const rawSize = Math.min(shellWidth || maxBoardSize, maxBoardSize);
      const size = Math.max(gridSize * 10, Math.floor(Math.max(minBoardSize, rawSize) / gridSize) * gridSize);

      canvas.width = size;
      canvas.height = size;
      draw();
    }

    function draw() {
      drawBoard();
      drawFood();
      drawSnake();

      if (!state.gameStarted && !state.gameOver) {
        drawBoardLabel("Pronto");
      }

      if (state.gameOver) {
        drawBoardLabel("Fim de jogo");
      }

      if (state.gameStarted && !state.gameOver && isRecovering()) {
        drawBoardLabel("Prepare-se");
      }
    }

    function drawBoard() {
      context.fillStyle = "#071521";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.strokeStyle = "rgba(156, 194, 231, 0.07)";
      context.lineWidth = 1;

      for (let x = gridSize; x < canvas.width; x += gridSize) {
        context.beginPath();
        context.moveTo(x + 0.5, 0);
        context.lineTo(x + 0.5, canvas.height);
        context.stroke();
      }

      for (let y = gridSize; y < canvas.height; y += gridSize) {
        context.beginPath();
        context.moveTo(0, y + 0.5);
        context.lineTo(canvas.width, y + 0.5);
        context.stroke();
      }

      const glow = context.createRadialGradient(
        canvas.width * 0.18,
        canvas.height * 0.14,
        10,
        canvas.width * 0.18,
        canvas.height * 0.14,
        canvas.width * 0.75,
      );
      glow.addColorStop(0, "rgba(95, 143, 197, 0.18)");
      glow.addColorStop(1, "rgba(95, 143, 197, 0)");
      context.fillStyle = glow;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }

    function drawSnake() {
      for (const [index, segment] of state.snake.entries()) {
        const x = segment.x * gridSize + 2;
        const y = segment.y * gridSize + 2;
        const size = gridSize - 4;
        const isHead = index === 0;

        context.fillStyle = isHead ? "#a7f3d0" : "#35d399";
        fillRoundRect(x, y, size, size, isHead ? 7 : 5);

        if (isHead) {
          context.fillStyle = "#082034";
          const eyeOffsetX = state.direction === "left" ? 5 : state.direction === "right" ? 11 : 6;
          const eyeOffsetY = state.direction === "up" ? 5 : state.direction === "down" ? 11 : 6;
          context.beginPath();
          context.arc(x + eyeOffsetX, y + eyeOffsetY, 2, 0, Math.PI * 2);
          context.arc(
            x + (state.direction === "left" || state.direction === "right" ? eyeOffsetX : 11),
            y + (state.direction === "up" || state.direction === "down" ? eyeOffsetY : 11),
            2,
            0,
            Math.PI * 2,
          );
          context.fill();
        }
      }
    }

    function drawFood() {
      const centerX = state.food.x * gridSize + gridSize / 2;
      const centerY = state.food.y * gridSize + gridSize / 2;

      context.fillStyle = "#fb7185";
      context.beginPath();
      context.arc(centerX, centerY, gridSize * 0.34, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = "rgba(255, 255, 255, 0.46)";
      context.lineWidth = 2;
      context.stroke();
    }

    function drawBoardLabel(label) {
      context.save();
      context.fillStyle = "rgba(5, 13, 24, 0.62)";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#f8fafc";
      context.font = "700 28px Inter, system-ui, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(label, canvas.width / 2, canvas.height / 2);
      context.restore();
    }

    function fillRoundRect(x, y, width, height, radius) {
      if (typeof context.roundRect === "function") {
        context.beginPath();
        context.roundRect(x, y, width, height, radius);
        context.fill();
        return;
      }

      context.fillRect(x, y, width, height);
    }

    function update() {
      state.direction = state.nextDirection;
      const movement = vectors[state.direction];
      const head = {
        x: state.snake[0].x + movement.x,
        y: state.snake[0].y + movement.y,
      };

      if (isOutOfBounds(head) || isOnSnake(head, true)) {
        handleCollision();
        return;
      }

      state.snake.unshift(head);

      if (head.x === state.food.x && head.y === state.food.y) {
        state.score += 1;
        updateScore();
        checkAndAwardLife();
        checkAndIncreaseSpeed();
        generateFood();
      } else {
        state.snake.pop();
      }
    }

    function isOutOfBounds(cell) {
      return cell.x < 0 || cell.x >= columns() || cell.y < 0 || cell.y >= rows();
    }

    function isOnSnake(cell, ignoreHead = false) {
      const startIndex = ignoreHead ? 1 : 0;

      for (let index = startIndex; index < state.snake.length; index += 1) {
        if (cell.x === state.snake[index].x && cell.y === state.snake[index].y) {
          return true;
        }
      }

      return false;
    }

    function generateFood() {
      const freeCells = [];

      for (let y = 0; y < rows(); y += 1) {
        for (let x = 0; x < columns(); x += 1) {
          const cell = { x, y };

          if (!isOnSnake(cell)) {
            freeCells.push(cell);
          }
        }
      }

      if (!freeCells.length) {
        state.gameOver = true;
        setStatus(`Tabuleiro completo. Pontuação final: ${state.score}.`);
        return;
      }

      state.food = freeCells[Math.floor(Math.random() * freeCells.length)];
    }

    function handleCollision() {
      if (state.lives > 0) {
        state.lives -= 1;
        state.snake = createExtraLifeSnake(state.snake.length);
        state.direction = "right";
        state.nextDirection = "right";
        state.recoveryUntil = Date.now() + extraLifeRecoveryDelay;
        state.recoveryTicks = extraLifeRecoveryTicks;
        updateLives();
        generateFood();
        restartLoop(Math.max(state.speed, extraLifeRecoverySpeed));
        setStatus(`Vida extra usada. Reposicionando no centro; restantes: ${state.lives}.`);
        return;
      }

      state.gameOver = true;
    }

    function tick() {
      if (state.gameOver) {
        finishGame();
        return;
      }

      if (isRecovering()) {
        draw();
        return;
      }

      const recoveryTicksBeforeUpdate = state.recoveryTicks;
      update();
      draw();

      if (!isRecovering() && recoveryTicksBeforeUpdate > 0 && state.recoveryTicks > 0 && !state.gameOver) {
        state.recoveryTicks -= 1;

        if (state.recoveryTicks === 0) {
          state.recoveryUntil = 0;
          restartLoop();
        }
      }
    }

    function isRecovering() {
      return state.recoveryUntil > Date.now();
    }

    function finishGame() {
      if (!state.scoreSaved) {
        state.scoreSaved = true;
        restartButton.hidden = false;
        setStatus(`Fim de jogo. Pontuação final: ${state.score}.`);
      }

      draw();
      stopLoop();
    }

    function setDirection(nextDirection) {
      if (!vectors[nextDirection] || !state.gameStarted || state.gameOver) {
        return;
      }

      if (opposite[nextDirection] === state.direction || opposite[nextDirection] === state.nextDirection) {
        return;
      }

      state.nextDirection = nextDirection;
    }

    function setDirectionFromPoint(clientX, clientY) {
      if (!state.gameStarted || state.gameOver || !state.snake.length) {
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const head = state.snake[0];
      const headX = rect.left + ((head.x + 0.5) / columns()) * rect.width;
      const headY = rect.top + ((head.y + 0.5) / rows()) * rect.height;
      const dx = clientX - headX;
      const dy = clientY - headY;

      if (Math.hypot(dx, dy) < 8) {
        return;
      }

      if (Math.abs(dx) > Math.abs(dy)) {
        setDirection(dx > 0 ? "right" : "left");
      } else {
        setDirection(dy > 0 ? "down" : "up");
      }
    }

    function handleKeyPress(event) {
      const isArrowKey = event.key.startsWith("Arrow");
      const key = event.key.toLowerCase();
      const editableTarget =
        event.target instanceof HTMLElement &&
        (event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName));

      if (isArrowKey && !editableTarget) {
        event.preventDefault();
      }

      if (editableTarget) {
        return;
      }

      if (event.key === "ArrowUp" || key === "w") {
        setDirection("up");
      }
      if (event.key === "ArrowDown" || key === "s") {
        setDirection("down");
      }
      if (event.key === "ArrowLeft" || key === "a") {
        setDirection("left");
      }
      if (event.key === "ArrowRight" || key === "d") {
        setDirection("right");
      }
    }

    function startGame() {
      state.playerName = normalizePlayerName(nameInput ? nameInput.value : "");
      resizeCanvas(true);
      state.snake = createSnake();
      state.direction = "right";
      state.nextDirection = "right";
      state.score = 0;
      state.lives = 0;
      state.awardedMilestones = [];
      state.speed = initialSpeed;
      state.gameOver = false;
      state.gameStarted = true;
      state.scoreSaved = false;
      state.recoveryUntil = 0;
      state.recoveryTicks = 0;
      startPanel.hidden = true;
      restartButton.hidden = true;
      updateScore();
      updateSpeedLabel();
      updateLives();
      generateFood();
      draw();
      setStatus(`${state.playerName} em jogo.`);
      boardShell.focus({ preventScroll: true });
      restartLoop();
    }

    function resetToStartScreen() {
      state.gameStarted = false;
      state.gameOver = false;
      state.scoreSaved = false;
      stopLoop();
      restartButton.hidden = true;
      startPanel.hidden = false;
      state.snake = createSnake();
      state.direction = "right";
      state.nextDirection = "right";
      state.score = 0;
      state.speed = initialSpeed;
      state.recoveryUntil = 0;
      state.recoveryTicks = 0;
      updateScore();
      updateSpeedLabel();
      updateLives();
      generateFood();
      draw();
      setStatus("Informe seu nome para iniciar.");

      if (nameInput) {
        nameInput.focus({ preventScroll: true });
      }
    }

    function normalizePlayerName(value) {
      const trimmedName = value.trim();
      return (trimmedName || "Anônimo").slice(0, 12);
    }

    function restartLoop(delay = state.speed) {
      stopLoop();
      state.intervalId = window.setInterval(tick, delay);
    }

    function stopLoop() {
      if (state.intervalId) {
        window.clearInterval(state.intervalId);
        state.intervalId = null;
      }
    }

    function updateScore() {
      scoreLabel.textContent = String(state.score);

      if (state.score > state.bestScore) {
        state.bestScore = state.score;
        writeBestScore(state.bestScore);
      }

      bestLabel.textContent = String(state.bestScore);
    }

    function updateSpeedLabel() {
      speedLabel.textContent = `${(initialSpeed / state.speed).toFixed(2)}x`;
    }

    function updateLives() {
      const fragment = document.createDocumentFragment();

      for (let index = 0; index < maxLives; index += 1) {
        const life = document.createElement("span");
        life.className = index < state.lives ? "snake-life is-active" : "snake-life";
        life.setAttribute("aria-hidden", "true");
        fragment.append(life);
      }

      livesContainer.replaceChildren(fragment);
    }

    function setStatus(message) {
      status.textContent = message;
    }

    function checkAndAwardLife() {
      for (const milestone of lifeMilestones) {
        if (state.score >= milestone && !state.awardedMilestones.includes(milestone)) {
          if (state.lives < maxLives) {
            state.lives += 1;
            updateLives();
            setStatus(`Vida extra liberada aos ${milestone} pontos.`);
          }

          state.awardedMilestones.push(milestone);
        }
      }
    }

    function checkAndIncreaseSpeed() {
      if (state.score > 0 && state.score % 20 === 0) {
        state.speed = Math.max(minimumSpeed, state.speed * 0.96);
        restartLoop(state.recoveryTicks > 0 ? Math.max(state.speed, extraLifeRecoverySpeed) : state.speed);
        updateSpeedLabel();
        setStatus(`Velocidade ajustada para ${speedLabel.textContent}.`);
      }
    }

    function readBestScore() {
      try {
        const value = Number(window.localStorage.getItem(localBestKey) || "0");
        return Number.isFinite(value) ? value : 0;
      } catch {
        return 0;
      }
    }

    function writeBestScore(value) {
      bestLabel.textContent = String(value);

      try {
        window.localStorage.setItem(localBestKey, String(value));
      } catch {
        // Local storage can be disabled in private contexts.
      }
    }

    window.addEventListener("keydown", handleKeyPress, { capture: true });

    canvas.addEventListener("pointerdown", (event) => {
      if (!state.gameStarted || state.gameOver) {
        return;
      }

      event.preventDefault();
      state.pointerStart = {
        x: event.clientX,
        y: event.clientY,
        id: event.pointerId,
      };

      if (canvas.setPointerCapture) {
        canvas.setPointerCapture(event.pointerId);
      }
    });

    canvas.addEventListener(
      "pointermove",
      (event) => {
        if (state.gameStarted && !state.gameOver) {
          event.preventDefault();
        }
      },
      { passive: false },
    );

    canvas.addEventListener("pointerup", (event) => {
      if (!state.pointerStart || state.pointerStart.id !== event.pointerId) {
        return;
      }

      event.preventDefault();
      const dx = event.clientX - state.pointerStart.x;
      const dy = event.clientY - state.pointerStart.y;
      const distance = Math.hypot(dx, dy);

      if (distance >= 24) {
        if (Math.abs(dx) > Math.abs(dy)) {
          setDirection(dx > 0 ? "right" : "left");
        } else {
          setDirection(dy > 0 ? "down" : "up");
        }
      } else {
        setDirectionFromPoint(event.clientX, event.clientY);
      }

      if (canvas.releasePointerCapture) {
        canvas.releasePointerCapture(event.pointerId);
      }

      state.pointerStart = null;
    });

    canvas.addEventListener("pointercancel", () => {
      state.pointerStart = null;
    });

    startButton.addEventListener("click", startGame);
    restartButton.addEventListener("click", resetToStartScreen);

    if (nameInput) {
      nameInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          startGame();
        }
      });
    }

    window.addEventListener("resize", () => resizeCanvas(false));

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", () => resizeCanvas(false));
    }

    resizeCanvas(true);
    state.snake = createSnake();
    generateFood();
    updateScore();
    updateSpeedLabel();
    updateLives();
    draw();
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

  function setupMathGame() {
    const root = document.querySelector("[data-math-game]");

    if (!root) {
      return;
    }

    const start = root.querySelector("[data-math-start]");
    const form = root.querySelector("[data-math-form]");
    const answerInput = root.querySelector("[data-math-answer]");
    const submit = root.querySelector("[data-math-submit]");
    const questionLabel = root.querySelector("[data-math-question]");
    const scoreLabel = root.querySelector("[data-math-score]");
    const streakLabel = root.querySelector("[data-math-streak]");
    const bestLabel = root.querySelector("[data-math-best]");
    const timeLabel = root.querySelector("[data-math-time]");
    const status = root.querySelector("[data-math-status]");

    if (!start || !form || !answerInput || !submit || !questionLabel || !scoreLabel || !streakLabel || !bestLabel || !timeLabel || !status) {
      return;
    }

    const roundDuration = 30;
    const bestScoreKey = "soma-rapida-best-score";
    const state = {
      active: false,
      score: 0,
      streak: 0,
      bestScore: readBestScore(),
      secondsLeft: roundDuration,
      answer: 0,
      timerId: 0,
    };

    function readBestScore() {
      try {
        const value = Number(window.localStorage.getItem(bestScoreKey) || "0");
        return Number.isFinite(value) ? value : 0;
      } catch {
        return 0;
      }
    }

    function writeBestScore(value) {
      try {
        window.localStorage.setItem(bestScoreKey, String(value));
      } catch {
        // A rodada não depende do storage local.
      }
    }

    function randomInt(min, max) {
      return min + Math.floor(Math.random() * (max - min + 1));
    }

    function setControlsEnabled(enabled) {
      answerInput.disabled = !enabled;
      submit.disabled = !enabled;
    }

    function setStatus(message) {
      status.textContent = message;
    }

    function updateStats() {
      scoreLabel.textContent = String(state.score);
      streakLabel.textContent = String(state.streak);
      bestLabel.textContent = String(state.bestScore);
    }

    function updateTimer() {
      timeLabel.textContent = `${state.secondsLeft}s`;
    }

    function createQuestion() {
      const level = Math.min(5, Math.floor(state.score / 50) + 1);
      const operations = level >= 3 ? ["+", "-", "x"] : ["+", "-"];
      const operation = operations[randomInt(0, operations.length - 1)];
      let left = randomInt(2, 8 + level * 3);
      let right = randomInt(2, 8 + level * 3);
      let answer = left + right;

      if (operation === "-") {
        if (right > left) {
          [left, right] = [right, left];
        }
        answer = left - right;
      }

      if (operation === "x") {
        left = randomInt(2, 5 + level);
        right = randomInt(2, 9);
        answer = left * right;
      }

      state.answer = answer;
      questionLabel.textContent = `${left} ${operation} ${right}`;
      answerInput.value = "";
      answerInput.focus({ preventScroll: true });
    }

    function finishGame() {
      state.active = false;
      window.clearInterval(state.timerId);
      state.timerId = 0;
      state.secondsLeft = Math.max(0, state.secondsLeft);
      setControlsEnabled(false);
      start.textContent = "Jogar de novo";
      questionLabel.textContent = "Fim";

      if (state.score > state.bestScore) {
        state.bestScore = state.score;
        writeBestScore(state.bestScore);
        setStatus(`Tempo esgotado. Nova melhor pontuação: ${state.score}.`);
      } else {
        setStatus(`Tempo esgotado. Pontuação final: ${state.score}.`);
      }

      updateStats();
      updateTimer();
    }

    function startGame() {
      window.clearInterval(state.timerId);
      state.active = true;
      state.score = 0;
      state.streak = 0;
      state.secondsLeft = roundDuration;
      start.textContent = "Recomeçar";
      setControlsEnabled(true);
      updateStats();
      updateTimer();
      setStatus("Rodada em andamento.");
      createQuestion();

      state.timerId = window.setInterval(() => {
        if (!state.active) {
          return;
        }

        state.secondsLeft -= 1;
        updateTimer();

        if (state.secondsLeft <= 0) {
          finishGame();
        }
      }, 1000);
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();

      if (!state.active) {
        return;
      }

      const rawAnswer = answerInput.value.trim();
      const userAnswer = Number(rawAnswer);

      if (rawAnswer === "" || !Number.isFinite(userAnswer)) {
        setStatus("Digite uma resposta para continuar.");
        answerInput.focus({ preventScroll: true });
        return;
      }

      if (userAnswer === state.answer) {
        state.streak += 1;
        const points = 10 + Math.min(10, Math.floor(state.streak / 3) * 2);
        state.score += points;
        setStatus(`Certo. +${points} pontos.`);
      } else {
        state.streak = 0;
        state.secondsLeft = Math.max(0, state.secondsLeft - 3);
        setStatus(`Ops, era ${state.answer}. -3s.`);
      }

      updateStats();
      updateTimer();

      if (state.secondsLeft <= 0) {
        finishGame();
        return;
      }

      createQuestion();
    });

    start.addEventListener("click", startGame);
    setControlsEnabled(false);
    updateStats();
    updateTimer();
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

  function setupCheckersGame() {
    const root = document.querySelector("[data-checkers-game]");

    if (!root) {
      return;
    }

    const size = 8;
    const white = "white";
    const black = "black";
    const diagonals = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];
    const maxHistory = 300;
    const checkersWinsStorageName = "dama_brasileira_wins_v1";
    const aiLevelStorageKey = "dama_brasileira_ai_level_v1";
    const machineColor = black;
    const files = "abcdefgh";
    const aiLevelLabels = {
      easy: "fácil",
      medium: "médio",
      hard: "difícil",
    };
    const aiProfiles = {
      easy: {
        mistakeChance: 0.62,
        topPool: 4,
        captureTopPool: 3,
        noise: 180,
        captureWeight: 80,
        promotionBonus: 38,
        kingBonus: 8,
        edgeBonus: 4,
        opponentCapturePenalty: 75,
        opponentMovePenalty: 2,
        mateBonus: 1200,
      },
      medium: {
        mistakeChance: 0.24,
        topPool: 3,
        captureTopPool: 2,
        noise: 95,
        captureWeight: 110,
        promotionBonus: 45,
        kingBonus: 10,
        edgeBonus: 5,
        opponentCapturePenalty: 100,
        opponentMovePenalty: 3,
        mateBonus: 3200,
      },
      hard: {
        mistakeChance: 0.05,
        topPool: 1,
        captureTopPool: 1,
        noise: 25,
        captureWeight: 135,
        promotionBonus: 55,
        kingBonus: 12,
        edgeBonus: 6,
        opponentCapturePenalty: 130,
        opponentMovePenalty: 4,
        mateBonus: 10000,
      },
    };

    const elements = {
      board: root.querySelector("[data-checkers-board]"),
      turnLabel: root.querySelector("[data-checkers-turn]"),
      whiteCount: root.querySelector("[data-checkers-white-count]"),
      blackCount: root.querySelector("[data-checkers-black-count]"),
      winsLabel: root.querySelector("[data-checkers-wins]"),
      modeLabel: root.querySelector("[data-checkers-mode]"),
      ruleLabel: root.querySelector("[data-checkers-rule]"),
      winnerLabel: root.querySelector("[data-checkers-winner]"),
      message: root.querySelector("[data-checkers-message]"),
      aiLevel: root.querySelector("[data-checkers-ai-level]"),
      toggleAi: root.querySelector("[data-checkers-toggle-ai]"),
      newGame: root.querySelector("[data-checkers-new]"),
      undo: root.querySelector("[data-checkers-undo]"),
    };

    if (!hasRequiredElements()) {
      return;
    }

    const state = {
      board: createInitialBoard(),
      turn: white,
      selected: null,
      legal: { capture: false, maxCapture: 0, moves: [], byFrom: {} },
      chain: null,
      winner: null,
      wins: loadWins(),
      aiLevel: loadAILevel(),
      vsMachine: true,
      aiTimerId: 0,
      history: [],
      message: "Brancas iniciam a partida.",
    };

    function hasRequiredElements() {
      return Boolean(
        elements.board
          && elements.turnLabel
          && elements.whiteCount
          && elements.blackCount
          && elements.winsLabel
          && elements.modeLabel
          && elements.ruleLabel
          && elements.winnerLabel
          && elements.message
          && elements.aiLevel
          && elements.toggleAi
          && elements.newGame
          && elements.undo,
      );
    }

    function createPiece(color, king = false) {
      return { color, king };
    }

    function createInitialBoard() {
      const board = Array.from({ length: size * size }, () => null);

      for (let row = 0; row < size; row += 1) {
        for (let col = 0; col < size; col += 1) {
          if (!isDarkSquare(row, col)) {
            continue;
          }

          const index = toIndex(row, col);
          if (row <= 2) {
            board[index] = createPiece(black);
          } else if (row >= 5) {
            board[index] = createPiece(white);
          }
        }
      }

      return board;
    }

    function toIndex(row, col) {
      return row * size + col;
    }

    function fromIndex(index) {
      return [Math.floor(index / size), index % size];
    }

    function isInside(row, col) {
      return row >= 0 && row < size && col >= 0 && col < size;
    }

    function isDarkSquare(row, col) {
      return (row + col) % 2 === 1;
    }

    function isPromotionRow(index, color) {
      const [row] = fromIndex(index);
      return (color === white && row === 0) || (color === black && row === size - 1);
    }

    function cloneBoard(board) {
      return board.map((piece) => (piece ? { color: piece.color, king: piece.king } : null));
    }

    function otherColor(color) {
      return color === white ? black : white;
    }

    function groupByFrom(moves) {
      return moves.reduce((acc, move) => {
        const key = String(move.from);
        if (!acc[key]) {
          acc[key] = [];
        }
        acc[key].push(move);
        return acc;
      }, {});
    }

    function getManCaptureOptions(board, origin, color) {
      const [row, col] = fromIndex(origin);
      const options = [];

      diagonals.forEach(([dr, dc]) => {
        const midRow = row + dr;
        const midCol = col + dc;
        const landRow = row + dr * 2;
        const landCol = col + dc * 2;

        if (!isInside(midRow, midCol) || !isInside(landRow, landCol)) {
          return;
        }

        const middle = toIndex(midRow, midCol);
        const landing = toIndex(landRow, landCol);
        const middlePiece = board[middle];

        if (!middlePiece || middlePiece.color === color || board[landing]) {
          return;
        }

        options.push({ capture: middle, land: landing });
      });

      return options;
    }

    function getKingCaptureOptions(board, origin, color) {
      const [row, col] = fromIndex(origin);
      const options = [];

      diagonals.forEach(([dr, dc]) => {
        let currentRow = row + dr;
        let currentCol = col + dc;
        let enemyIndex = null;

        while (isInside(currentRow, currentCol)) {
          const index = toIndex(currentRow, currentCol);
          const piece = board[index];

          if (!enemyIndex) {
            if (!piece) {
              currentRow += dr;
              currentCol += dc;
              continue;
            }

            if (piece.color === color) {
              break;
            }

            enemyIndex = index;
            currentRow += dr;
            currentCol += dc;

            while (isInside(currentRow, currentCol) && !board[toIndex(currentRow, currentCol)]) {
              options.push({ capture: enemyIndex, land: toIndex(currentRow, currentCol) });
              currentRow += dr;
              currentCol += dc;
            }
            break;
          }
        }
      });

      return options;
    }

    function generateManCaptures(board, start, color) {
      const sequences = [];

      function explore(currentBoard, origin, landings, captures) {
        const options = getManCaptureOptions(currentBoard, origin, color);

        if (isPromotionRow(origin, color) && captures.length > 0 && options.length === 0) {
          sequences.push({ from: start, landings: [...landings], captures: [...captures] });
          return;
        }

        if (options.length === 0) {
          if (captures.length > 0) {
            sequences.push({ from: start, landings: [...landings], captures: [...captures] });
          }
          return;
        }

        options.forEach((option) => {
          const nextBoard = cloneBoard(currentBoard);
          const movingPiece = nextBoard[origin];
          nextBoard[origin] = null;
          nextBoard[option.capture] = null;
          nextBoard[option.land] = movingPiece;
          explore(nextBoard, option.land, [...landings, option.land], [...captures, option.capture]);
        });
      }

      explore(board, start, [], []);
      return sequences;
    }

    function generateKingCaptures(board, start, color) {
      const sequences = [];

      function explore(currentBoard, origin, landings, captures) {
        const options = getKingCaptureOptions(currentBoard, origin, color);
        if (!options.length) {
          if (captures.length > 0) {
            sequences.push({ from: start, landings: [...landings], captures: [...captures] });
          }
          return;
        }

        options.forEach((option) => {
          const nextBoard = cloneBoard(currentBoard);
          const movingPiece = nextBoard[origin];
          nextBoard[origin] = null;
          nextBoard[option.capture] = null;
          nextBoard[option.land] = movingPiece;
          explore(nextBoard, option.land, [...landings, option.land], [...captures, option.capture]);
        });
      }

      explore(board, start, [], []);
      return sequences;
    }

    function generateQuietMovesForPiece(board, index, piece) {
      const moves = [];
      const [row, col] = fromIndex(index);

      if (!piece.king) {
        const forward = piece.color === white ? -1 : 1;
        [-1, 1].forEach((dc) => {
          const nextRow = row + forward;
          const nextCol = col + dc;

          if (!isInside(nextRow, nextCol)) {
            return;
          }

          const destination = toIndex(nextRow, nextCol);
          if (!board[destination]) {
            moves.push({ from: index, landings: [destination], captures: [] });
          }
        });
        return moves;
      }

      diagonals.forEach(([dr, dc]) => {
        let nextRow = row + dr;
        let nextCol = col + dc;

        while (isInside(nextRow, nextCol)) {
          const destination = toIndex(nextRow, nextCol);

          if (board[destination]) {
            break;
          }

          moves.push({ from: index, landings: [destination], captures: [] });
          nextRow += dr;
          nextCol += dc;
        }
      });

      return moves;
    }

    function buildLegalState(board, turn) {
      const captureMoves = [];

      board.forEach((piece, index) => {
        if (!piece || piece.color !== turn) {
          return;
        }

        const sequences = piece.king
          ? generateKingCaptures(board, index, piece.color)
          : generateManCaptures(board, index, piece.color);
        captureMoves.push(...sequences);
      });

      if (captureMoves.length > 0) {
        const maxCapture = captureMoves.reduce((max, move) => Math.max(max, move.captures.length), 0);
        const bestMoves = captureMoves.filter((move) => move.captures.length === maxCapture);
        return {
          capture: true,
          maxCapture,
          moves: bestMoves,
          byFrom: groupByFrom(bestMoves),
        };
      }

      const quietMoves = [];
      board.forEach((piece, index) => {
        if (!piece || piece.color !== turn) {
          return;
        }
        quietMoves.push(...generateQuietMovesForPiece(board, index, piece));
      });

      return {
        capture: false,
        maxCapture: 0,
        moves: quietMoves,
        byFrom: groupByFrom(quietMoves),
      };
    }

    function getSelectableSources() {
      if (state.winner || isMachineTurn()) {
        return [];
      }
      if (state.chain) {
        return [state.chain.pieceIndex];
      }
      return Object.keys(state.legal.byFrom).map((value) => Number(value));
    }

    function getDestinationSquares() {
      if (state.winner || isMachineTurn()) {
        return [];
      }

      if (state.chain) {
        return [...new Set(state.chain.variants.map((variant) => variant.landings[0]))];
      }

      if (state.selected === null) {
        return [];
      }

      const options = state.legal.byFrom[String(state.selected)] || [];
      return [...new Set(options.map((option) => option.landings[0]))];
    }

    function countPieces(color) {
      return state.board.reduce((sum, piece) => (piece && piece.color === color ? sum + 1 : sum), 0);
    }

    function isMachineTurn() {
      return state.vsMachine && !state.winner && !state.chain && state.turn === machineColor;
    }

    function clearAiTimer() {
      if (state.aiTimerId) {
        window.clearTimeout(state.aiTimerId);
        state.aiTimerId = 0;
      }
    }

    function formatSquare(index) {
      const [row, col] = fromIndex(index);
      return `${files[col]}${size - row}`;
    }

    function boardScore(board) {
      return board.reduce((score, piece) => {
        if (!piece) {
          return score;
        }
        const value = piece.king ? 175 : 100;
        return score + (piece.color === machineColor ? value : -value);
      }, 0);
    }

    function isEdgeSquare(index) {
      const [row, col] = fromIndex(index);
      return row === 0 || row === size - 1 || col === 0 || col === size - 1;
    }

    function getAIProfile() {
      return aiProfiles[state.aiLevel] || aiProfiles.easy;
    }

    function getAILevelLabel() {
      return aiLevelLabels[state.aiLevel] || aiLevelLabels.easy;
    }

    function simulateMove(board, move) {
      const nextBoard = cloneBoard(board);
      let current = move.from;
      let movingPiece = nextBoard[current];

      if (!movingPiece) {
        return { board: nextBoard, promoted: false, destination: current };
      }

      nextBoard[current] = null;
      for (let index = 0; index < move.landings.length; index += 1) {
        const destination = move.landings[index];
        if (move.captures[index] !== undefined) {
          nextBoard[move.captures[index]] = null;
        }
        nextBoard[destination] = movingPiece;
        if (current !== destination) {
          nextBoard[current] = null;
        }
        current = destination;
      }

      let promoted = false;
      if (!movingPiece.king && isPromotionRow(current, movingPiece.color)) {
        movingPiece = { ...movingPiece, king: true };
        nextBoard[current] = movingPiece;
        promoted = true;
      }

      return { board: nextBoard, promoted, destination: current };
    }

    function evaluateAIMove(move) {
      const profile = getAIProfile();
      const sourcePiece = state.board[move.from];
      const simulation = simulateMove(state.board, move);
      const opponentLegal = buildLegalState(simulation.board, otherColor(machineColor));

      let score = 0;
      score += boardScore(simulation.board);
      score += move.captures.length * profile.captureWeight;
      score += simulation.promoted ? profile.promotionBonus : 0;
      score += sourcePiece && sourcePiece.king ? profile.kingBonus : 0;
      score += isEdgeSquare(simulation.destination) ? profile.edgeBonus : 0;

      if (opponentLegal.capture) {
        score -= opponentLegal.maxCapture * profile.opponentCapturePenalty;
        score -= opponentLegal.moves.length * profile.opponentMovePenalty;
      }

      if (!opponentLegal.moves.length) {
        score += profile.mateBonus;
      }

      return score;
    }

    function pickMachineMove() {
      const profile = getAIProfile();
      const moves = state.legal.moves;

      if (!moves.length) {
        return null;
      }
      if (moves.length === 1) {
        return moves[0];
      }

      if (Math.random() < profile.mistakeChance) {
        return moves[Math.floor(Math.random() * moves.length)];
      }

      const scoredMoves = moves
        .map((move) => ({
          move,
          score: evaluateAIMove(move) + (Math.random() * 2 - 1) * profile.noise,
        }))
        .sort((left, right) => right.score - left.score);
      const poolLimit = state.legal.capture ? profile.captureTopPool : profile.topPool;
      const poolSize = Math.max(1, Math.min(poolLimit, scoredMoves.length));
      return scoredMoves[Math.floor(Math.random() * poolSize)].move;
    }

    function maybeQueueMachineTurn() {
      if (!isMachineTurn()) {
        clearAiTimer();
        return;
      }
      if (state.aiTimerId) {
        return;
      }
      state.aiTimerId = window.setTimeout(() => {
        state.aiTimerId = 0;
        machinePlayTurn();
      }, 420);
    }

    function deepClone(value) {
      if (typeof structuredClone === "function") {
        return structuredClone(value);
      }
      return JSON.parse(JSON.stringify(value));
    }

    function pushHistory() {
      state.history.push(deepClone({
        board: state.board,
        turn: state.turn,
        selected: state.selected,
        legal: state.legal,
        chain: state.chain,
        winner: state.winner,
        wins: state.wins,
        message: state.message,
      }));

      if (state.history.length > maxHistory) {
        state.history.shift();
      }
    }

    function restoreSnapshot(snapshot) {
      state.board = snapshot.board;
      state.turn = snapshot.turn;
      state.selected = snapshot.selected;
      state.legal = snapshot.legal;
      state.chain = snapshot.chain;
      state.winner = snapshot.winner;
      state.wins = snapshot.wins;
      state.message = snapshot.message;
    }

    function undoMove() {
      clearAiTimer();
      if (!state.history.length) {
        setMessage("Não há jogadas para desfazer.");
        render();
        maybeQueueMachineTurn();
        return;
      }

      restoreSnapshot(state.history.pop());
      saveWins(state.wins);
      setMessage("Última jogada desfeita.");
      render();
      maybeQueueMachineTurn();
    }

    function maybePromote(index) {
      const piece = state.board[index];

      if (!piece || piece.king || !isPromotionRow(index, piece.color)) {
        return false;
      }

      piece.king = true;
      return true;
    }

    function applyCaptureStep(from, to, capturedIndex) {
      const movingPiece = state.board[from];
      state.board[from] = null;
      state.board[capturedIndex] = null;
      state.board[to] = movingPiece;
    }

    function completeTurn(promoted, actor = "human", actorNote = "") {
      state.selected = null;
      state.chain = null;
      state.turn = otherColor(state.turn);
      state.legal = buildLegalState(state.board, state.turn);

      const whiteLeft = countPieces(white);
      const blackLeft = countPieces(black);

      if (whiteLeft === 0) {
        state.winner = black;
      } else if (blackLeft === 0) {
        state.winner = white;
      } else if (!state.legal.moves.length) {
        state.winner = otherColor(state.turn);
      } else {
        state.winner = null;
      }

      if (state.winner) {
        state.wins[state.winner] += 1;
        saveWins(state.wins);
        const winnerLabel = state.winner === white ? "Brancas" : "Pretas";
        const prefix = actorNote ? `${actorNote} ` : "";
        setMessage(`${prefix}Fim de jogo: ${winnerLabel} venceram.`);
      } else if (state.legal.capture) {
        const pieceWord = state.legal.maxCapture === 1 ? "peça" : "peças";
        let prefix = "";
        if (actorNote) {
          prefix += `${actorNote} `;
        }
        if (actor === "machine") {
          prefix += "Agora é a vez das brancas. ";
        }
        if (promoted) {
          prefix += "Dama formada. ";
        }
        setMessage(`${prefix}Captura obrigatória: escolha sequência de ${state.legal.maxCapture} ${pieceWord}.`);
      } else {
        let text = "";
        if (actorNote) {
          text += `${actorNote} `;
        }
        if (actor === "machine") {
          text += "Agora é a vez das brancas. ";
        }
        text += promoted ? "Dama formada. Turno trocado." : "Turno trocado.";
        setMessage(text);
      }

      render();
      maybeQueueMachineTurn();
    }

    function playQuietMove(move) {
      pushHistory();
      const from = move.from;
      const to = move.landings[0];
      const movingPiece = state.board[from];
      state.board[from] = null;
      state.board[to] = movingPiece;
      completeTurn(maybePromote(to));
    }

    function machinePlayTurn() {
      if (!isMachineTurn()) {
        return;
      }

      const move = pickMachineMove();
      if (!move) {
        return;
      }

      pushHistory();
      let current = move.from;
      const movingPiece = state.board[current];
      state.board[current] = null;

      for (let index = 0; index < move.landings.length; index += 1) {
        const destination = move.landings[index];
        if (move.captures[index] !== undefined) {
          state.board[move.captures[index]] = null;
        }
        state.board[destination] = movingPiece;
        if (current !== destination) {
          state.board[current] = null;
        }
        current = destination;
      }

      const promoted = maybePromote(current);
      const moveText = move.captures.length
        ? `Máquina capturou ${move.captures.length} ${move.captures.length === 1 ? "peça" : "peças"} (${formatSquare(move.from)} -> ${formatSquare(current)}).`
        : `Máquina moveu ${formatSquare(move.from)} -> ${formatSquare(current)}.`;
      completeTurn(promoted, "machine", moveText);
    }

    function startCaptureChain(variants, destination) {
      pushHistory();
      const source = state.selected;
      const capturedIndex = variants[0].captures[0];
      applyCaptureStep(source, destination, capturedIndex);

      const remaining = variants.map((variant) => ({
        from: destination,
        landings: variant.landings.slice(1),
        captures: variant.captures.slice(1),
      }));
      const pending = remaining.filter((variant) => variant.landings.length > 0);

      if (!pending.length) {
        completeTurn(maybePromote(destination));
        return;
      }

      state.chain = {
        pieceIndex: destination,
        variants: pending,
      };
      state.selected = destination;
      setMessage("Captura múltipla: continue com a mesma peça.");
      render();
    }

    function continueCaptureChain(destination) {
      const variants = state.chain.variants.filter((variant) => variant.landings[0] === destination);

      if (!variants.length) {
        return;
      }

      pushHistory();
      const source = state.chain.pieceIndex;
      const capturedIndex = variants[0].captures[0];
      applyCaptureStep(source, destination, capturedIndex);

      const remaining = variants.map((variant) => ({
        from: destination,
        landings: variant.landings.slice(1),
        captures: variant.captures.slice(1),
      }));
      const pending = remaining.filter((variant) => variant.landings.length > 0);

      if (!pending.length) {
        completeTurn(maybePromote(destination));
        return;
      }

      state.chain = {
        pieceIndex: destination,
        variants: pending,
      };
      state.selected = destination;
      setMessage("Continue a sequência de captura.");
      render();
    }

    function setMessage(text) {
      state.message = text;
      elements.message.textContent = text;
    }

    function newGame() {
      clearAiTimer();
      state.board = createInitialBoard();
      state.turn = white;
      state.selected = null;
      state.chain = null;
      state.winner = null;
      state.history = [];
      state.legal = buildLegalState(state.board, state.turn);
      setMessage("Novo jogo iniciado. Brancas jogam primeiro.");
      render();
      maybeQueueMachineTurn();
    }

    function updateModeUI() {
      const levelLabel = getAILevelLabel();
      elements.toggleAi.textContent = state.vsMachine ? "Vs máquina: ON" : "Vs máquina: OFF";
      elements.aiLevel.value = state.aiLevel;
      elements.aiLevel.disabled = !state.vsMachine;
      elements.modeLabel.textContent = state.vsMachine
        ? `Modo: 1 jogador (máquina ${levelLabel} nas pretas).`
        : "Modo: 2 jogadores locais.";
    }

    function handleAILevelChange(event) {
      const nextLevel = String(event.target.value || "");

      if (!aiProfiles[nextLevel]) {
        event.target.value = state.aiLevel;
        return;
      }

      state.aiLevel = nextLevel;
      saveAILevel(state.aiLevel);
      clearAiTimer();

      if (state.vsMachine) {
        setMessage(`Dificuldade da máquina ajustada para ${getAILevelLabel()}.`);
      } else {
        setMessage(`Dificuldade ${getAILevelLabel()} salva. Ative o modo máquina para aplicar.`);
      }

      render();
      maybeQueueMachineTurn();
    }

    function toggleMachineMode() {
      state.vsMachine = !state.vsMachine;
      clearAiTimer();
      state.selected = null;
      state.chain = null;
      updateModeUI();

      if (state.vsMachine) {
        setMessage(`Modo máquina ativado (pretas automáticas, dificuldade ${getAILevelLabel()}).`);
      } else {
        setMessage("Modo máquina desativado. Jogo local para 2 jogadores.");
      }

      render();
      maybeQueueMachineTurn();
    }

    function describePiece(piece) {
      if (!piece) {
        return "vazia";
      }
      const color = piece.color === white ? "branca" : "preta";
      return piece.king ? `dama ${color}` : `peça ${color}`;
    }

    function handleBoardClick(event) {
      const square = event.target.closest("[data-checkers-square]");

      if (!square || !elements.board.contains(square)) {
        return;
      }
      if (isMachineTurn()) {
        setMessage("Aguarde a jogada da máquina.");
        render();
        return;
      }

      const index = Number(square.dataset.index);
      if (!Number.isInteger(index)) {
        return;
      }

      const [row, col] = fromIndex(index);
      if (!isDarkSquare(row, col) || state.winner) {
        return;
      }

      const selectable = new Set(getSelectableSources());
      const destinations = new Set(getDestinationSquares());

      if (state.chain) {
        if (destinations.has(index)) {
          continueCaptureChain(index);
          return;
        }
        setMessage("Captura em andamento: use a mesma peça.");
        render();
        return;
      }

      if (state.selected !== null && destinations.has(index)) {
        const options = state.legal.byFrom[String(state.selected)] || [];
        const matching = options.filter((option) => option.landings[0] === index);

        if (!matching.length) {
          return;
        }

        if (state.legal.capture) {
          startCaptureChain(matching, index);
        } else {
          playQuietMove(matching[0]);
        }
        return;
      }

      if (selectable.has(index)) {
        state.selected = index;
        setMessage(state.legal.capture ? "Escolha o próximo salto da captura." : "Escolha o destino da peça.");
        render();
        return;
      }

      state.selected = null;
      render();
    }

    function renderBoard() {
      const selectable = new Set(getSelectableSources());
      const destinations = new Set(getDestinationSquares());
      const forced = state.chain ? state.chain.pieceIndex : null;
      const markup = [];

      for (let row = 0; row < size; row += 1) {
        for (let col = 0; col < size; col += 1) {
          const index = toIndex(row, col);
          const piece = state.board[index];
          const dark = isDarkSquare(row, col);
          const classes = ["checkers-square", dark ? "is-dark" : "is-light"];

          if (dark && selectable.has(index)) {
            classes.push("is-selectable");
          }
          if (dark && state.selected === index) {
            classes.push("is-selected");
          }
          if (dark && destinations.has(index)) {
            classes.push("is-destination");
          }
          if (dark && forced === index) {
            classes.push("is-forced");
          }

          const pieceMarkup = piece
            ? `<span class="checkers-piece is-${piece.color}${piece.king ? " is-king" : ""}" aria-hidden="true"></span>`
            : "";
          const dotMarkup = dark && destinations.has(index) && !piece
            ? '<span class="checkers-target-dot" aria-hidden="true"></span>'
            : "";

          markup.push(`
            <button
              type="button"
              class="${classes.join(" ")}"
              data-checkers-square
              data-index="${index}"
              aria-label="Casa ${row + 1},${col + 1} ${describePiece(piece)}"
            >
              ${pieceMarkup}
              ${dotMarkup}
            </button>
          `);
        }
      }

      elements.board.innerHTML = markup.join("");
    }

    function renderInfo() {
      updateModeUI();

      const whitePieces = countPieces(white);
      const blackPieces = countPieces(black);
      const turnText = state.turn === white ? "Brancas" : "Pretas";
      const winnerText = state.winner
        ? `${state.winner === white ? "Brancas" : "Pretas"} venceram.`
        : "Partida em andamento.";

      elements.turnLabel.textContent = state.winner ? "-" : turnText;
      elements.whiteCount.textContent = String(whitePieces);
      elements.blackCount.textContent = String(blackPieces);
      elements.winsLabel.textContent = `${state.wins[white]} / ${state.wins[black]}`;
      elements.winnerLabel.textContent = winnerText;
      elements.winnerLabel.classList.toggle("is-final", Boolean(state.winner));

      if (state.winner) {
        elements.ruleLabel.textContent = "Partida finalizada.";
      } else if (state.chain) {
        elements.ruleLabel.textContent = "Captura múltipla obrigatória em andamento.";
      } else if (state.legal.capture) {
        const pieceWord = state.legal.maxCapture === 1 ? "peça" : "peças";
        elements.ruleLabel.textContent = `Regra da maioria ativa: capturar ${state.legal.maxCapture} ${pieceWord}.`;
      } else {
        elements.ruleLabel.textContent = "Sem captura obrigatória neste turno.";
      }

      elements.message.textContent = state.message;
      elements.undo.disabled = state.history.length === 0;
    }

    function render() {
      renderBoard();
      renderInfo();
    }

    function loadWins() {
      try {
        const raw = window.localStorage.getItem(checkersWinsStorageName);

        if (!raw) {
          return { [white]: 0, [black]: 0 };
        }

        const parsed = JSON.parse(raw);
        return {
          [white]: Number(parsed[white]) || 0,
          [black]: Number(parsed[black]) || 0,
        };
      } catch {
        return { [white]: 0, [black]: 0 };
      }
    }

    function saveWins(wins) {
      try {
        window.localStorage.setItem(checkersWinsStorageName, JSON.stringify(wins));
      } catch {
        // A partida continua normalmente quando o navegador bloqueia storage.
      }
    }

    function loadAILevel() {
      try {
        const raw = window.localStorage.getItem(aiLevelStorageKey);
        if (!raw || !aiProfiles[raw]) {
          return "easy";
        }
        return raw;
      } catch {
        return "easy";
      }
    }

    function saveAILevel(level) {
      try {
        window.localStorage.setItem(aiLevelStorageKey, level);
      } catch {
        // A partida continua normalmente quando o navegador bloqueia storage.
      }
    }

    elements.board.addEventListener("click", handleBoardClick);
    elements.aiLevel.addEventListener("change", handleAILevelChange);
    elements.toggleAi.addEventListener("click", toggleMachineMode);
    elements.newGame.addEventListener("click", newGame);
    elements.undo.addEventListener("click", undoMove);
    window.addEventListener("pagehide", clearAiTimer, { once: true });

    state.legal = buildLegalState(state.board, state.turn);
    render();
    maybeQueueMachineTurn();
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

  setupNotFoundPath();
  setupErrorPage();
  setupServiceWorker();
  setupSpotifyEmbeds();
  setupBlogBrowser();
  setupProjectsCatalog();
  setupRickAndMortyPortal();
  setupGames();
  setupNotesWall();
  setupArticleCodeCopy();
  setupArticleTOC();
})();
