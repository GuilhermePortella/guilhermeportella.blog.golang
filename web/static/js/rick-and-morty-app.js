(() => {
  const root = document.querySelector("[data-rick-morty-app]");

  if (!root) {
    return;
  }

  const BASE_URL = "https://rickandmortyapi.com/api";
  const PAGE_SIZE = 12;
  const API_PAGE_SIZE = 20;
  const UNKNOWN_LABEL = "Nao informado";

  const RESOURCE_CONFIG = {
    character: {
      label: "Personagens",
      singular: "Personagem",
      apiPath: "character",
      pathPrefix: "/rick-morty/personagem",
      emptyMessage: "Nenhum personagem encontrado.",
      fields: [
        { key: "status", label: "Status" },
        { key: "species", label: "Especie" },
        { key: "gender", label: "Genero" },
        { key: "originName", label: "Origem" },
        { key: "locationName", label: "Local atual" },
        { key: "episodeCount", label: "Episodios" },
      ],
    },
    location: {
      label: "Locais",
      singular: "Local",
      apiPath: "location",
      pathPrefix: "/rick-morty/local",
      emptyMessage: "Nenhum local encontrado.",
      fields: [
        { key: "type", label: "Tipo" },
        { key: "dimension", label: "Dimensao" },
        { key: "residentsCount", label: "Residentes" },
      ],
    },
    episode: {
      label: "Episodios",
      singular: "Episodio",
      apiPath: "episode",
      pathPrefix: "/rick-morty/episodio",
      emptyMessage: "Nenhum episodio encontrado.",
      fields: [
        { key: "episode", label: "Codigo" },
        { key: "air_date", label: "Exibicao" },
        { key: "charactersCount", label: "Personagens" },
      ],
    },
  };

  const emptyData = {
    items: [],
    count: 0,
    totalPages: 1,
    startIndex: 0,
    endIndex: PAGE_SIZE,
    apiStart: 1,
    apiEnd: 1,
  };

  const basePath = routerBasePath();
  let activeRequest = null;
  let state = {
    resource: "character",
    searchInput: "",
    searchTerm: "",
    page: 1,
    data: emptyData,
    status: "loading",
    error: "",
  };

  function routerBasePath() {
    const raw = root.dataset.url || "/rick-morty";
    const pathname = new URL(raw, window.location.origin).pathname.replace(/\/$/, "");
    const marker = "/rick-morty";

    if (pathname.endsWith(marker)) {
      return pathname.slice(0, -marker.length);
    }

    return "";
  }

  function appPath() {
    const pathname = window.location.pathname.replace(/\/$/, "") || "/";
    if (basePath && pathname.startsWith(basePath)) {
      return pathname.slice(basePath.length) || "/";
    }
    return pathname;
  }

  function siteURL(path) {
    if (!path.startsWith("/")) {
      return path;
    }
    return `${basePath}${path}`;
  }

  function navigate(path, replace = false) {
    const nextURL = siteURL(path);
    if (replace) {
      window.history.replaceState({}, "", nextURL);
    } else {
      window.history.pushState({}, "", nextURL);
    }
    route();
  }

  function beginRequest() {
    if (activeRequest) {
      activeRequest.abort();
    }

    const controller = new AbortController();
    let active = true;
    activeRequest = {
      abort() {
        active = false;
        controller.abort();
      },
    };

    return {
      signal: controller.signal,
      isActive: () => active,
    };
  }

  function escapeHTML(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function readable(value) {
    if (value === null || value === undefined) {
      return UNKNOWN_LABEL;
    }

    const text = String(value).trim();
    const normalized = text.toLowerCase();

    if (text === "" || normalized === "unknown" || normalized === "n/a") {
      return UNKNOWN_LABEL;
    }

    return text;
  }

  function numberText(value) {
    if (!Number.isFinite(value)) {
      return UNKNOWN_LABEL;
    }

    return new Intl.NumberFormat("pt-BR").format(value);
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function statusClass(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "alive" || normalized === "vivo") {
      return "alive";
    }
    if (normalized === "dead" || normalized === "morto") {
      return "dead";
    }
    return "unknown";
  }

  function safeRickURL(value) {
    if (!value) {
      return "";
    }

    try {
      const parsed = new URL(value);
      if (parsed.protocol !== "https:" || parsed.hostname !== "rickandmortyapi.com") {
        return "";
      }
      return parsed.href;
    } catch {
      return "";
    }
  }

  async function fetchJSON(path, { signal, params } = {}) {
    const url = new URL(`${BASE_URL}/${path}`);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== null && value !== undefined && String(value).trim() !== "") {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const response = await fetch(url.href, {
      signal,
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      const error = new Error("Rick and Morty API request failed.");
      error.status = response.status;
      throw error;
    }

    return response.json();
  }

  async function fetchResourceApiPage(resource, apiPage, searchTerm, signal) {
    try {
      return await fetchJSON(resource, {
        signal,
        params: {
          page: apiPage,
          name: searchTerm,
        },
      });
    } catch (error) {
      if (error?.status === 404) {
        return {
          info: { count: 0, pages: 0 },
          results: [],
        };
      }
      throw error;
    }
  }

  async function fetchVisualResourcePage(resource, page, searchTerm, signal) {
    const startIndex = (page - 1) * PAGE_SIZE;
    const endIndex = startIndex + PAGE_SIZE;
    const apiStart = Math.floor(startIndex / API_PAGE_SIZE) + 1;
    const apiEnd = Math.floor((endIndex - 1) / API_PAGE_SIZE) + 1;

    const firstPage = await fetchResourceApiPage(resource, apiStart, searchTerm, signal);
    const firstResults = safeArray(firstPage?.results);
    const count = Number(firstPage?.info?.count) || 0;

    if (count === 0) {
      return {
        ...emptyData,
        startIndex,
        endIndex,
        apiStart,
        apiEnd: apiStart,
      };
    }

    const maxApiPage = Math.max(1, Math.ceil(count / API_PAGE_SIZE));
    const boundedApiEnd = Math.min(apiEnd, maxApiPage);
    const chunks = [firstResults];

    if (boundedApiEnd > apiStart) {
      const secondPage = await fetchResourceApiPage(resource, boundedApiEnd, searchTerm, signal);
      chunks.push(safeArray(secondPage?.results));
    }

    const offset = startIndex - (apiStart - 1) * API_PAGE_SIZE;
    const visible = chunks
      .flat()
      .slice(offset, offset + PAGE_SIZE)
      .map((item) => normalizeItem(resource, item));

    return {
      items: visible,
      count,
      totalPages: Math.max(1, Math.ceil(count / PAGE_SIZE)),
      startIndex,
      endIndex,
      apiStart,
      apiEnd: boundedApiEnd,
    };
  }

  function normalizeItem(resource, item) {
    if (resource === "character") {
      return {
        id: item.id,
        name: readable(item.name),
        image: safeRickURL(item.image),
        fields: {
          status: readable(item.status),
          species: readable(item.species),
          gender: readable(item.gender),
          originName: readable(item.origin?.name),
          locationName: readable(item.location?.name),
          episodeCount: readable(safeArray(item.episode).length),
        },
      };
    }

    if (resource === "location") {
      return {
        id: item.id,
        name: readable(item.name),
        fields: {
          type: readable(item.type),
          dimension: readable(item.dimension),
          residentsCount: readable(safeArray(item.residents).length),
        },
      };
    }

    return {
      id: item.id,
      name: readable(item.name),
      fields: {
        episode: readable(item.episode),
        air_date: readable(item.air_date),
        charactersCount: readable(safeArray(item.characters).length),
      },
    };
  }

  function extractIdFromURL(value) {
    const match = String(value || "").match(/\/(\d+)$/);
    return match ? match[1] : null;
  }

  function chunks(items, size) {
    const result = [];
    for (let index = 0; index < items.length; index += size) {
      result.push(items.slice(index, index + size));
    }
    return result;
  }

  async function fetchByIds(resource, ids, signal) {
    const cleanIds = ids.filter(Boolean);

    if (cleanIds.length === 0) {
      return [];
    }

    const responses = await Promise.all(
      chunks(cleanIds, 20).map(async (batch) => {
        const data = await fetchJSON(`${resource}/${batch.join(",")}`, { signal });
        return Array.isArray(data) ? data : [data];
      }),
    );

    return responses.flat();
  }

  function parseAPIDate(value) {
    const monthIndex = {
      january: 0,
      february: 1,
      march: 2,
      april: 3,
      may: 4,
      june: 5,
      july: 6,
      august: 7,
      september: 8,
      october: 9,
      november: 10,
      december: 11,
    };
    const match = String(value).trim().match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/);

    if (match) {
      const month = monthIndex[match[1].toLowerCase()];
      if (month !== undefined) {
        return new Date(Number(match[3]), month, Number(match[2]));
      }
    }

    return new Date(value);
  }

  function formatAPIDate(value, options = { dateStyle: "long" }) {
    const text = readable(value);
    if (text === UNKNOWN_LABEL) {
      return UNKNOWN_LABEL;
    }

    const date = parseAPIDate(text);
    if (Number.isNaN(date.getTime())) {
      return UNKNOWN_LABEL;
    }

    return new Intl.DateTimeFormat("pt-BR", options).format(date);
  }

  function episodeParts(code) {
    const match = String(code || "").match(/S(\d+)E(\d+)/i);

    if (!match) {
      return {
        season: UNKNOWN_LABEL,
        episode: UNKNOWN_LABEL,
      };
    }

    return {
      season: String(Number(match[1])),
      episode: String(Number(match[2])),
    };
  }

  function renderExplorer() {
    const config = RESOURCE_CONFIG[state.resource];
    const firstVisible = state.data.count === 0 ? 0 : state.data.startIndex + 1;
    const lastVisible = Math.min(state.data.endIndex, state.data.count);
    const statusText = explorerStatusText(config, firstVisible, lastVisible);

    root.innerHTML = `
      <div class="rick-app" aria-label="Rick and Morty API">
        <section class="rick-hero" aria-labelledby="rick-title">
          <div class="container rick-hero__grid">
            <div class="rick-hero__content">
              <a class="rick-back arrow-shift" href="${siteURL("/curiosidades")}">Voltar para curiosidades <span class="link-arrow" aria-hidden="true">-&gt;</span></a>
              <p class="curiosity-eyebrow curiosity-eyebrow--hero">api externa</p>
              <h1 id="rick-title">Rick and Morty API</h1>
              <p class="rick-hero__lead">Explore personagens, locais e episodios com busca controlada, paginacao propria e detalhes navegaveis.</p>
            </div>
            <aside class="rick-hero__panel" aria-label="Resumo tecnico da pagina">
              <p class="curiosity-eyebrow">base url</p>
              <code>${BASE_URL}</code>
              <div class="rick-hero__metric">
                <span>${PAGE_SIZE}</span>
                <strong>itens por pagina visual</strong>
              </div>
              <p>A API entrega 20 itens por pagina; esta interface calcula a janela visual e busca uma ou duas paginas quando precisa.</p>
            </aside>
          </div>
        </section>
        <section class="rick-browser" aria-labelledby="rick-browser-title">
          <div class="container">
            <div class="rick-browser__header">
              <div>
                <p class="curiosity-eyebrow">explorador</p>
                <h2 id="rick-browser-title">${escapeHTML(config.label)}</h2>
                <p>${escapeHTML(state.searchTerm ? `Busca por "${state.searchTerm}"` : "Todos os nomes")}</p>
              </div>
              <a class="rick-doc-link arrow-shift" href="https://rickandmortyapi.com/documentation/" target="_blank" rel="noopener noreferrer">
                Documentacao <span class="link-arrow" aria-hidden="true">-&gt;</span>
              </a>
            </div>
            <div class="rick-toolbar" aria-label="Filtros da API">
              <div class="rick-resource-tabs" role="tablist" aria-label="Recurso">
                ${Object.entries(RESOURCE_CONFIG).map(resourceTab).join("")}
              </div>
              <form class="rick-search" role="search" data-rick-search>
                <label class="rick-field">
                  <span>Nome</span>
                  <input type="search" value="${escapeHTML(state.searchInput)}" placeholder="Rick, Morty, Earth, Pilot" autocomplete="off" data-rick-search-input>
                </label>
                <div class="rick-search__actions">
                  <button class="rick-button rick-button--primary" type="submit" ${state.status === "loading" ? "disabled" : ""}>Buscar</button>
                  <button class="rick-button rick-button--ghost" type="button" data-rick-clear>Limpar</button>
                </div>
              </form>
            </div>
            <div class="rick-status-line" role="status">${escapeHTML(statusText)}</div>
            ${explorerBody(config)}
            ${paginationHTML()}
          </div>
        </section>
      </div>
    `;

    bindExplorerEvents();
    document.title = "Rick and Morty API";
  }

  function resourceTab([key, config]) {
    const active = state.resource === key;
    return `
      <button type="button" class="${active ? "is-active" : ""}" aria-pressed="${active ? "true" : "false"}" data-rick-resource="${key}">
        ${escapeHTML(config.label)}
      </button>
    `;
  }

  function explorerStatusText(config, firstVisible, lastVisible) {
    if (state.status === "loading") {
      return "Carregando dados da API.";
    }
    if (state.status === "error") {
      return state.error;
    }
    if (state.data.count === 0) {
      return config.emptyMessage;
    }
    return `${numberText(firstVisible)}-${numberText(lastVisible)} de ${numberText(state.data.count)} registros.`;
  }

  function explorerBody(config) {
    if (state.status === "loading") {
      return `
        <div class="rick-result-grid" aria-hidden="true">
          ${Array.from({ length: PAGE_SIZE }, () => '<div class="rick-result-card rick-result-card--skeleton"></div>').join("")}
        </div>
      `;
    }

    if (state.status === "error") {
      return `
        <div class="rick-state rick-state--error">
          <h2>Algo saiu do eixo.</h2>
          <p>${escapeHTML(state.error)}</p>
        </div>
      `;
    }

    if (state.data.items.length === 0) {
      return `
        <div class="rick-state rick-state--empty">
          <h2>${escapeHTML(config.emptyMessage)}</h2>
          <p>Tente outro nome ou limpe a busca para voltar ao catalogo completo.</p>
        </div>
      `;
    }

    return `
      <div class="rick-result-grid">
        ${state.data.items.map((item) => resultCardHTML(state.resource, item)).join("")}
      </div>
    `;
  }

  function resultCardHTML(resource, item) {
    const config = RESOURCE_CONFIG[resource];
    const href = siteURL(`${config.pathPrefix}/${item.id}`);
    const media = resource === "character" && item.image
      ? `<img src="${item.image}" alt="" loading="lazy" width="300" height="300">`
      : `<span>${escapeHTML(config.singular)}</span>`;

    return `
      <a class="rick-result-card rick-result-card--${resource}" href="${href}" data-app-link>
        <div class="rick-result-card__media" aria-hidden="true">${media}</div>
        <div class="rick-result-card__content">
          <span class="rick-result-card__type">${escapeHTML(config.singular)}</span>
          <h3>${escapeHTML(item.name)}</h3>
          <dl>
            ${config.fields.map((field) => resultFieldHTML(field, item.fields[field.key])).join("")}
          </dl>
        </div>
      </a>
    `;
  }

  function resultFieldHTML(field, value) {
    const rendered = field.key === "status"
      ? `<span class="rick-status rick-status--${statusClass(value)}">${escapeHTML(value)}</span>`
      : escapeHTML(value);

    return `
      <div>
        <dt>${escapeHTML(field.label)}</dt>
        <dd>${rendered}</dd>
      </div>
    `;
  }

  function paginationHTML() {
    return `
      <nav class="rick-pagination" aria-label="Paginacao">
        <button type="button" data-rick-prev ${state.status === "loading" || state.page <= 1 ? "disabled" : ""}>Anterior</button>
        <span>Pagina ${numberText(state.page)} de ${numberText(state.data.totalPages)}</span>
        <button type="button" data-rick-next ${state.status === "loading" || state.page >= state.data.totalPages ? "disabled" : ""}>Proxima</button>
      </nav>
    `;
  }

  function bindExplorerEvents() {
    root.querySelectorAll("[data-rick-resource]").forEach((button) => {
      button.addEventListener("click", () => {
        state = {
          ...state,
          resource: button.dataset.rickResource,
          page: 1,
        };
        loadExplorerData();
      });
    });

    const input = root.querySelector("[data-rick-search-input]");
    if (input) {
      input.addEventListener("input", () => {
        state.searchInput = input.value;
      });
    }

    root.querySelector("[data-rick-search]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      state = {
        ...state,
        searchTerm: state.searchInput.trim(),
        page: 1,
      };
      loadExplorerData();
    });

    root.querySelector("[data-rick-clear]")?.addEventListener("click", () => {
      state = {
        ...state,
        searchInput: "",
        searchTerm: "",
        page: 1,
      };
      loadExplorerData();
    });

    root.querySelector("[data-rick-prev]")?.addEventListener("click", () => {
      if (state.page <= 1) {
        return;
      }
      state = { ...state, page: state.page - 1 };
      loadExplorerData();
    });

    root.querySelector("[data-rick-next]")?.addEventListener("click", () => {
      if (state.page >= state.data.totalPages) {
        return;
      }
      state = { ...state, page: state.page + 1 };
      loadExplorerData();
    });

    bindAppLinks();
  }

  async function loadExplorerData() {
    const request = beginRequest();
    const config = RESOURCE_CONFIG[state.resource];
    state = {
      ...state,
      status: "loading",
      error: "",
    };
    renderExplorer();

    try {
      const data = await fetchVisualResourcePage(config.apiPath, state.page, state.searchTerm, request.signal);
      if (!request.isActive()) {
        return;
      }
      state = {
        ...state,
        data,
        status: "success",
      };
      renderExplorer();
    } catch (error) {
      if (!request.isActive() || error?.name === "AbortError") {
        return;
      }
      state = {
        ...state,
        data: emptyData,
        status: "error",
        error: "Nao foi possivel carregar os dados da API agora.",
      };
      renderExplorer();
    }
  }

  function renderDetailShell(content) {
    root.innerHTML = `
      <div class="rick-app rick-detail-page">
        <section class="rick-detail-shell">
          <div class="container">
            <a class="rick-back arrow-shift" href="${siteURL("/rick-morty")}" data-app-link>Voltar ao portal <span class="link-arrow" aria-hidden="true">-&gt;</span></a>
            ${content}
          </div>
        </section>
      </div>
    `;
    bindAppLinks();
  }

  function renderDetailLoading() {
    renderDetailShell(`
      <div class="rick-detail-card rick-detail-card--loading">
        <p>Carregando detalhe da API.</p>
      </div>
    `);
  }

  function renderDetailError(message) {
    renderDetailShell(`
      <div class="rick-detail-card rick-state--error">
        <h1>Nao foi possivel carregar.</h1>
        <p>${escapeHTML(message)}</p>
      </div>
    `);
  }

  function infoGridHTML(items) {
    return `
      <dl class="rick-info-grid">
        ${items.map((item) => `
          <div>
            <dt>${escapeHTML(item.label)}</dt>
            <dd>${escapeHTML(item.value)}</dd>
          </div>
        `).join("")}
      </dl>
    `;
  }

  function relatedStatusHTML(status, error, empty) {
    if (status === "loading") {
      return '<p class="rick-related-status">Carregando dados relacionados.</p>';
    }
    if (status === "error") {
      return `<p class="rick-related-status rick-related-status--error">${escapeHTML(error)}</p>`;
    }
    if (empty) {
      return '<p class="rick-related-status">Nenhum item relacionado para exibir.</p>';
    }
    return "";
  }

  async function loadCharacterDetail(id) {
    const request = beginRequest();
    let character = null;
    let episodes = [];
    let mainStatus = "loading";
    let mainError = "";
    let relatedStatus = "loading";
    let relatedError = "";
    let tab = "resumo";

    const render = () => {
      if (mainStatus === "loading") {
        renderDetailLoading();
        return;
      }
      if (mainStatus === "error") {
        renderDetailError(mainError);
        return;
      }

      const info = [
        { label: "ID", value: readable(character.id) },
        { label: "Status", value: readable(character.status) },
        { label: "Especie", value: readable(character.species) },
        { label: "Genero", value: readable(character.gender) },
        { label: "Tipo", value: readable(character.type) },
        { label: "Origem", value: readable(character.origin?.name) },
        { label: "Local atual", value: readable(character.location?.name) },
        { label: "Total de episodios", value: readable(safeArray(character.episode).length) },
      ];
      const relatedHTML = relatedStatusHTML(relatedStatus, relatedError, episodes.length === 0);
      const episodesHTML = relatedHTML || `
        <div class="rick-episode-list">
          ${episodes.map((episode) => `
            <article>
              <span>${escapeHTML(readable(episode.episode))}</span>
              <h2>${escapeHTML(readable(episode.name))}</h2>
              <p>${escapeHTML(readable(episode.air_date))}</p>
            </article>
          `).join("")}
        </div>
      `;

      renderDetailShell(`
        <article class="rick-detail-card rick-character-detail">
          <div class="rick-character-detail__media">
            ${character.image ? `<img src="${safeRickURL(character.image)}" alt="Retrato de ${escapeHTML(readable(character.name))}" width="300" height="300">` : ""}
          </div>
          <div class="rick-character-detail__content">
            <p class="curiosity-eyebrow">personagem</p>
            <h1>${escapeHTML(readable(character.name))}</h1>
            <div class="rick-tabs" role="tablist" aria-label="Detalhes do personagem">
              <button type="button" class="${tab === "resumo" ? "is-active" : ""}" data-rick-tab="resumo">Resumo</button>
              <button type="button" class="${tab === "episodios" ? "is-active" : ""}" data-rick-tab="episodios">Episodios</button>
            </div>
            ${tab === "resumo" ? infoGridHTML(info) : episodesHTML}
          </div>
        </article>
      `);

      document.title = `${readable(character.name)} | Rick and Morty API`;
      root.querySelectorAll("[data-rick-tab]").forEach((button) => {
        button.addEventListener("click", () => {
          tab = button.dataset.rickTab || "resumo";
          render();
        });
      });
    };

    render();

    try {
      character = await fetchJSON(`character/${id}`, { signal: request.signal });
      if (!request.isActive()) {
        return;
      }
      mainStatus = "success";
      relatedStatus = "loading";
      render();

      try {
        episodes = await fetchByIds("episode", safeArray(character.episode).map(extractIdFromURL), request.signal);
        if (!request.isActive()) {
          return;
        }
        relatedStatus = "success";
        render();
      } catch (error) {
        if (!request.isActive() || error?.name === "AbortError") {
          return;
        }
        relatedStatus = "error";
        relatedError = "Nao foi possivel carregar os episodios deste personagem.";
        render();
      }
    } catch (error) {
      if (!request.isActive() || error?.name === "AbortError") {
        return;
      }
      mainStatus = "error";
      mainError = error?.status === 404 ? "Personagem nao encontrado." : "Erro ao consultar personagem.";
      render();
    }
  }

  async function loadEpisodeDetail(id) {
    const request = beginRequest();
    let episode = null;
    let characters = [];
    let mainStatus = "loading";
    let mainError = "";
    let relatedStatus = "loading";
    let relatedError = "";

    const render = () => {
      if (mainStatus === "loading") {
        renderDetailLoading();
        return;
      }
      if (mainStatus === "error") {
        renderDetailError(mainError);
        return;
      }

      const parts = episodeParts(episode.episode);
      const info = [
        { label: "ID", value: readable(episode.id) },
        { label: "Codigo", value: readable(episode.episode) },
        { label: "Temporada", value: parts.season },
        { label: "Numero do episodio", value: parts.episode },
        { label: "Exibicao original", value: readable(episode.air_date) },
        { label: "Exibicao pt-BR", value: formatAPIDate(episode.air_date) },
        { label: "Criado em", value: formatAPIDate(episode.created, { dateStyle: "medium", timeStyle: "short" }) },
        { label: "Total de personagens", value: readable(safeArray(episode.characters).length) },
      ];
      const related = relatedStatusHTML(relatedStatus, relatedError, characters.length === 0) || personGridHTML(characters);

      renderDetailShell(`
        <article class="rick-detail-card">
          <p class="curiosity-eyebrow">episodio</p>
          <h1>${escapeHTML(readable(episode.name))}</h1>
          ${infoGridHTML(info)}
        </article>
        <section class="rick-related-section" aria-labelledby="episode-characters-title">
          <div class="rick-related-section__header">
            <p class="curiosity-eyebrow">personagens</p>
            <h2 id="episode-characters-title">Personagens do episodio</h2>
          </div>
          ${related}
        </section>
      `);

      document.title = `${readable(episode.name)} | Rick and Morty API`;
    };

    render();

    try {
      episode = await fetchJSON(`episode/${id}`, { signal: request.signal });
      if (!request.isActive()) {
        return;
      }
      mainStatus = "success";
      render();

      try {
        characters = await fetchByIds("character", safeArray(episode.characters).map(extractIdFromURL), request.signal);
        if (!request.isActive()) {
          return;
        }
        relatedStatus = "success";
        render();
      } catch (error) {
        if (!request.isActive() || error?.name === "AbortError") {
          return;
        }
        relatedStatus = "error";
        relatedError = "Nao foi possivel carregar os personagens deste episodio.";
        render();
      }
    } catch (error) {
      if (!request.isActive() || error?.name === "AbortError") {
        return;
      }
      mainStatus = "error";
      mainError = error?.status === 404 ? "Episodio nao encontrado." : "Erro ao consultar episodio.";
      render();
    }
  }

  async function loadLocationDetail(id) {
    const request = beginRequest();
    let location = null;
    let residents = [];
    let mainStatus = "loading";
    let mainError = "";
    let relatedStatus = "loading";
    let relatedError = "";

    const render = () => {
      if (mainStatus === "loading") {
        renderDetailLoading();
        return;
      }
      if (mainStatus === "error") {
        renderDetailError(mainError);
        return;
      }

      const totalResidents = safeArray(location.residents).length;
      const info = [
        { label: "Nome", value: readable(location.name) },
        { label: "ID", value: readable(location.id) },
        { label: "Tipo", value: readable(location.type) },
        { label: "Dimensao", value: readable(location.dimension) },
        { label: "Total real de residentes", value: readable(totalResidents) },
      ];
      const preview = totalResidents > 24 ? `<p>Mostrando 24 de ${numberText(totalResidents)} residentes.</p>` : "";
      const related = relatedStatusHTML(relatedStatus, relatedError, residents.length === 0) || personGridHTML(residents);

      renderDetailShell(`
        <article class="rick-detail-card">
          <p class="curiosity-eyebrow">local</p>
          <h1>${escapeHTML(readable(location.name))}</h1>
          ${infoGridHTML(info)}
        </article>
        <section class="rick-related-section" aria-labelledby="location-residents-title">
          <div class="rick-related-section__header">
            <p class="curiosity-eyebrow">residentes</p>
            <h2 id="location-residents-title">Previa de residentes</h2>
            ${preview}
          </div>
          ${related}
        </section>
      `);

      document.title = `${readable(location.name)} | Rick and Morty API`;
    };

    render();

    try {
      location = await fetchJSON(`location/${id}`, { signal: request.signal });
      if (!request.isActive()) {
        return;
      }
      mainStatus = "success";
      render();

      try {
        const residentIds = safeArray(location.residents).map(extractIdFromURL).filter(Boolean).slice(0, 24);
        residents = await fetchByIds("character", residentIds, request.signal);
        if (!request.isActive()) {
          return;
        }
        relatedStatus = "success";
        render();
      } catch (error) {
        if (!request.isActive() || error?.name === "AbortError") {
          return;
        }
        relatedStatus = "error";
        relatedError = "Nao foi possivel carregar os residentes deste local.";
        render();
      }
    } catch (error) {
      if (!request.isActive() || error?.name === "AbortError") {
        return;
      }
      mainStatus = "error";
      mainError = error?.status === 404 ? "Local nao encontrado." : "Erro ao consultar local.";
      render();
    }
  }

  function personGridHTML(people) {
    return `
      <div class="rick-person-grid">
        ${people.map((person) => `
          <a class="rick-person-card" href="${siteURL(`/rick-morty/personagem/${person.id}`)}" data-app-link>
            ${person.image ? `<img src="${safeRickURL(person.image)}" alt="" loading="lazy" width="160" height="160">` : ""}
            <div>
              <h3>${escapeHTML(readable(person.name))}</h3>
              <p><span class="rick-status rick-status--${statusClass(person.status)}">${escapeHTML(readable(person.status))}</span></p>
              <p>${escapeHTML(readable(person.species))}</p>
            </div>
          </a>
        `).join("")}
      </div>
    `;
  }

  function bindAppLinks() {
    root.querySelectorAll("[data-app-link]").forEach((link) => {
      link.addEventListener("click", (event) => {
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
          return;
        }

        const url = new URL(link.href);
        if (url.origin !== window.location.origin) {
          return;
        }

        event.preventDefault();
        const nextPath = basePath && url.pathname.startsWith(basePath)
          ? url.pathname.slice(basePath.length)
          : url.pathname;
        navigate(nextPath || "/");
      });
    });
  }

  function route() {
    const path = appPath();

    if (path === "/curiosidades/rick-and-morty") {
      navigate("/rick-morty", true);
      return;
    }

    const characterMatch = path.match(/^\/rick-morty\/personagem\/(\d+)$/);
    if (characterMatch) {
      loadCharacterDetail(characterMatch[1]);
      return;
    }

    const locationMatch = path.match(/^\/rick-morty\/local\/(\d+)$/);
    if (locationMatch) {
      loadLocationDetail(locationMatch[1]);
      return;
    }

    const episodeMatch = path.match(/^\/rick-morty\/episodio\/(\d+)$/);
    if (episodeMatch) {
      loadEpisodeDetail(episodeMatch[1]);
      return;
    }

    if (path !== "/rick-morty") {
      navigate("/rick-morty", true);
      return;
    }

    loadExplorerData();
  }

  window.addEventListener("popstate", route);
  window.addEventListener("pagehide", () => {
    if (activeRequest) {
      activeRequest.abort();
    }
  }, { once: true });

  route();
})();
