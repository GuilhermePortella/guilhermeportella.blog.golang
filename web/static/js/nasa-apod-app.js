(() => {
  const root = document.querySelector("[data-nasa-apod-app]");

  if (!root) {
    return;
  }

  const API_URL = root.dataset.apiUrl || "https://api.nasa.gov/planetary/apod";
  const EONET_URL = root.dataset.eonetUrl || "https://eonet.gsfc.nasa.gov/api/v3/events";
  const APOD_START = "1995-06-16";
  const CACHE_PREFIX = "gp:nasa-apod:";
  const EONET_CACHE_TTL = 1000 * 60 * 20;
  const CACHE_TTL = 1000 * 60 * 60 * 8;

  const statusLabel = root.querySelector("[data-apod-status]");
  const eonetStatus = root.querySelector("[data-eonet-status]");
  const message = root.querySelector("[data-apod-message]");
  const feature = root.querySelector("[data-apod-feature]");
  const gallery = root.querySelector("[data-apod-gallery]");
  const form = root.querySelector("[data-apod-form]");
  const dateInput = root.querySelector("[data-apod-date]");
  const todayButton = root.querySelector("[data-apod-today]");
  const randomButton = root.querySelector("[data-apod-random]");
  const eonetForm = root.querySelector("[data-eonet-form]");
  const eonetCategory = root.querySelector("[data-eonet-category]");
  const eonetEventStatus = root.querySelector("[data-eonet-event-status]");
  const eonetSummary = root.querySelector("[data-eonet-summary]");
  const eonetEvents = root.querySelector("[data-eonet-events]");

  const today = localISODate(new Date());

  if (dateInput) {
    dateInput.min = APOD_START;
    dateInput.max = today;
    dateInput.value = today;
  }

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    loadByDate(dateInput?.value || today);
  });

  todayButton?.addEventListener("click", () => {
    if (dateInput) {
      dateInput.value = today;
    }
    loadByDate(today);
  });

  randomButton?.addEventListener("click", () => {
    loadRandom(true);
  });

  eonetForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    loadEONET(true);
  });

  loadByDate(today);
  loadRandom(false);
  loadEONET(false);

  async function loadByDate(date) {
    if (!validDate(date)) {
      setMessage(`Escolha uma data entre ${formatDate(APOD_START)} e ${formatDate(today)}.`);
      return;
    }

    setStatus("Consultando");
    setMessage("Buscando o registro APOD selecionado.");
    feature?.replaceChildren(skeleton());

    try {
      const item = await fetchAPOD(`date:${date}`, { date, thumbs: "true" });
      renderFeature(item);
      setStatus("Online");
      setMessage(`Registro de ${formatDate(item.date || date)} carregado.`);
    } catch (error) {
      setStatus("Falha");
      setMessage(error.message || "Nao consegui consultar a NASA agora.");
      renderFeatureError();
    }
  }

  async function loadRandom(forceRefresh) {
    if (!gallery) {
      return;
    }

    gallery.replaceChildren(galleryLoading());

    try {
      const key = forceRefresh ? `random:${Date.now()}` : "random:6";
      const items = await fetchAPOD(key, { count: "6", thumbs: "true" });
      const list = Array.isArray(items) ? items : [items];
      renderGallery(list);
    } catch {
      gallery.replaceChildren(galleryEmpty("A galeria nao carregou agora. Tente novamente em alguns instantes."));
    }
  }

  async function loadEONET(forceRefresh) {
    if (!eonetEvents) {
      return;
    }

    setEONETStatus("Consultando");
    renderEONETSkeleton();

    const params = {
      status: eonetEventStatus?.value || "open",
      limit: "8",
    };

    if (eonetCategory?.value) {
      params.category = eonetCategory.value;
    }

    try {
      const payload = await fetchEONET(params, forceRefresh);
      const events = Array.isArray(payload.events) ? payload.events : [];
      renderEONET(events, payload);
      setEONETStatus("Online");
    } catch {
      setEONETStatus("Falha");
      renderEONETError();
    }
  }

  async function fetchAPOD(cacheKey, params) {
    const cached = readCache(cacheKey);

    if (cached) {
      return cached;
    }

    const url = new URL(API_URL);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url.href, { headers: { Accept: "application/json" } });

    if (!response.ok) {
      throw new Error(response.status === 429 ? "Limite temporario da NASA atingido." : "A NASA retornou uma resposta inesperada.");
    }

    const payload = await response.json();
    writeCache(cacheKey, payload);
    return payload;
  }

  async function fetchEONET(params, forceRefresh) {
    const url = new URL(EONET_URL);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const cacheKey = `eonet:${url.searchParams.toString()}`;
    const cached = forceRefresh ? null : readCache(cacheKey, EONET_CACHE_TTL);

    if (cached) {
      return cached;
    }

    const response = await fetch(url.href, { headers: { Accept: "application/json" } });

    if (!response.ok) {
      throw new Error("EONET indisponivel.");
    }

    const payload = await response.json();
    writeCache(cacheKey, payload);
    return payload;
  }

  function renderFeature(item) {
    if (!feature) {
      return;
    }

    const article = document.createElement("article");
    article.className = "astronomy-apod";

    const media = document.createElement("div");
    media.className = "astronomy-apod__media";
    media.append(renderMedia(item, "Imagem ou video da APOD"));

    const content = document.createElement("div");
    content.className = "astronomy-apod__content";

    const meta = document.createElement("p");
    meta.className = "astronomy-apod__meta";
    meta.textContent = [formatDate(item.date), item.media_type === "video" ? "video" : "imagem"].filter(Boolean).join(" / ");

    const title = document.createElement("h3");
    title.textContent = item.title || "Astronomy Picture of the Day";

    const explanation = document.createElement("p");
    explanation.textContent = item.explanation || "A NASA nao retornou uma explicacao para este registro.";

    const links = document.createElement("div");
    links.className = "astronomy-apod__links";
    appendExternalLink(links, item.url, "Abrir original");
    appendExternalLink(links, item.hdurl, "Abrir alta resolucao");
    appendExternalLink(links, apodArticleURL(item.date), "Abrir artigo APOD");

    if (item.copyright) {
      const credit = document.createElement("p");
      credit.className = "astronomy-apod__credit";
      credit.textContent = `Credito: ${item.copyright}`;
      content.append(meta, title, explanation, credit, links);
    } else {
      content.append(meta, title, explanation, links);
    }

    article.append(media, content);
    feature.replaceChildren(article);
  }

  function renderGallery(items) {
    if (!gallery) {
      return;
    }

    const usable = items.filter((item) => item && (item.url || item.thumbnail_url));

    if (usable.length === 0) {
      gallery.replaceChildren(galleryEmpty("Nenhum item visual retornou desta vez."));
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const item of usable) {
      const card = document.createElement("article");
      card.className = "astronomy-gallery-card";

      const media = document.createElement("div");
      media.className = "astronomy-gallery-card__media";
      media.append(renderMedia(item, item.title || "Registro APOD"));

      const title = document.createElement("h3");
      title.textContent = item.title || "APOD";

      const meta = document.createElement("p");
      meta.textContent = formatDate(item.date);

      card.append(media, title, meta);
      fragment.append(card);
    }

    gallery.replaceChildren(fragment);
  }

  function renderEONET(events, payload) {
    if (!eonetEvents || !eonetSummary) {
      return;
    }

    eonetSummary.replaceChildren(eonetSummaryLine(events, payload));

    if (events.length === 0) {
      eonetEvents.replaceChildren(galleryEmpty("Nenhum evento encontrado para estes filtros."));
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const event of events) {
      fragment.append(eonetCard(event));
    }
    eonetEvents.replaceChildren(fragment);
  }

  function eonetSummaryLine(events, payload) {
    const categories = new Set();
    const sources = new Set();

    for (const event of events) {
      for (const category of event.categories || []) {
        if (category.title) {
          categories.add(category.title);
        }
      }
      for (const source of event.sources || []) {
        if (source.id) {
          sources.add(source.id);
        }
      }
    }

    const line = document.createElement("p");
    line.className = "astronomy-message";
    line.textContent = `${events.length} eventos retornados por ${payload.title || "EONET"} / ${categories.size} categorias / ${sources.size} fontes.`;
    return line;
  }

  function eonetCard(event) {
    const latest = latestGeometry(event);
    const category = (event.categories || [])[0];
    const source = (event.sources || [])[0];
    const article = document.createElement("article");
    article.className = "astronomy-eonet-card";

    const header = document.createElement("div");
    header.className = "astronomy-eonet-card__header";

    const badge = document.createElement("span");
    badge.className = "astronomy-eonet-card__badge";
    badge.textContent = category?.title || "Evento";

    const state = document.createElement("span");
    state.className = event.closed ? "astronomy-eonet-card__state astronomy-eonet-card__state--closed" : "astronomy-eonet-card__state";
    state.textContent = event.closed ? "Encerrado" : "Ativo";
    header.append(badge, state);

    const title = document.createElement("h3");
    title.textContent = event.title || "Evento natural";

    const description = document.createElement("p");
    description.textContent = event.description || "Evento monitorado pelo Earth Observatory Natural Event Tracker.";

    const facts = document.createElement("dl");
    facts.className = "astronomy-eonet-card__facts";
    appendFact(facts, "Data", formatDateTime(latest?.date));
    appendFact(facts, "Geometria", latest?.type || "n/d");
    appendFact(facts, "Local", coordinatesLabel(latest?.coordinates));
    appendFact(facts, "Magnitude", magnitudeLabel(latest));

    const links = document.createElement("div");
    links.className = "astronomy-eonet-card__links";
    appendExternalLink(links, event.link, "API do evento");
    appendExternalLink(links, source?.url, source?.id ? `Fonte ${source.id}` : "Fonte");

    article.append(header, title, description, facts, links);
    return article;
  }

  function renderEONETSkeleton() {
    if (!eonetEvents || !eonetSummary) {
      return;
    }

    eonetSummary.replaceChildren(galleryEmpty("Carregando eventos naturais."));
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < 3; index += 1) {
      const card = document.createElement("article");
      card.className = "astronomy-eonet-card astronomy-eonet-card--skeleton";
      fragment.append(card);
    }
    eonetEvents.replaceChildren(fragment);
  }

  function renderEONETError() {
    if (!eonetEvents || !eonetSummary) {
      return;
    }

    eonetSummary.replaceChildren(galleryEmpty("Nao consegui consultar o EONET agora."));
    eonetEvents.replaceChildren(galleryEmpty("A API pode estar temporariamente indisponivel. Tente atualizar em alguns instantes."));
  }

  function renderMedia(item, alt) {
    if (item.media_type === "video") {
      const safeURL = safeFrameURL(item.url);

      if (safeURL) {
        const iframe = document.createElement("iframe");
        iframe.title = item.title || alt;
        iframe.src = safeURL;
        iframe.loading = "lazy";
        iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
        iframe.allowFullscreen = true;
        return iframe;
      }

      const thumbnail = safeImageURL(item.thumbnail_url);
      if (thumbnail) {
        const link = mediaLink(item.url || thumbnail, item.title || "Abrir video");
        const image = document.createElement("img");
        image.src = thumbnail;
        image.alt = item.title || alt;
        image.loading = "lazy";
        link.replaceChildren(image);
        return link;
      }

      return externalLink(item.url, "Abrir video da NASA");
    }

    const imageURL = safeImageURL(item.url) || safeImageURL(item.hdurl);
    if (!imageURL) {
      return externalLink(item.hdurl || item.url, "Abrir midia externa");
    }

    const image = document.createElement("img");
    image.src = imageURL;
    image.alt = item.title || alt;
    image.loading = "lazy";
    const link = mediaLink(item.hdurl || item.url || imageURL, item.title || alt);
    link.replaceChildren(image);
    return link;
  }

  function renderFeatureError() {
    if (!feature) {
      return;
    }

    const empty = document.createElement("article");
    empty.className = "astronomy-state";
    empty.innerHTML = "<h3>Contato perdido</h3><p>A consulta falhou. O limite publico da NASA pode ter sido atingido ou o servico pode estar indisponivel.</p>";
    feature.replaceChildren(empty);
  }

  function skeleton() {
    const article = document.createElement("article");
    article.className = "astronomy-skeleton";
    article.innerHTML = "<div></div><div><span></span><span></span><span></span></div>";
    return article;
  }

  function galleryLoading() {
    const text = document.createElement("p");
    text.className = "astronomy-message";
    text.textContent = "Carregando amostras aleatorias.";
    return text;
  }

  function galleryEmpty(text) {
    const element = document.createElement("p");
    element.className = "astronomy-message";
    element.textContent = text;
    return element;
  }

  function appendExternalLink(parent, href, label) {
    const safeURL = safeHTTPURL(href);

    if (!safeURL) {
      return;
    }

    parent.append(externalLink(safeURL, label));
  }

  function externalLink(href, label) {
    const link = document.createElement("a");
    link.href = safeHTTPURL(href) || "#";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = label;
    return link;
  }

  function mediaLink(href, label) {
    const link = externalLink(href, label);
    link.className = "astronomy-media-link";
    link.setAttribute("aria-label", label);
    return link;
  }

  function apodArticleURL(date) {
    if (!validDate(date)) {
      return "";
    }

    const [year, month, day] = date.split("-");
    return `https://apod.nasa.gov/apod/ap${year.slice(2)}${month}${day}.html`;
  }

  function validDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= APOD_START && value <= today;
  }

  function localISODate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function formatDate(value) {
    if (!value) {
      return "";
    }

    const [year, month, day] = value.split("-");
    if (!year || !month || !day) {
      return value;
    }

    return `${day}/${month}/${year}`;
  }

  function formatDateTime(value) {
    if (!value) {
      return "n/d";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
      timeZoneName: "short",
    }).format(date);
  }

  function latestGeometry(event) {
    const geometries = Array.isArray(event?.geometry) ? event.geometry : [];
    return geometries[geometries.length - 1] || null;
  }

  function appendFact(parent, label, value) {
    const term = document.createElement("dt");
    term.textContent = label;
    const description = document.createElement("dd");
    description.textContent = value || "n/d";
    parent.append(term, description);
  }

  function coordinatesLabel(coordinates) {
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      return "n/d";
    }

    const [longitude, latitude] = coordinates;
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      return "n/d";
    }

    return `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`;
  }

  function magnitudeLabel(geometry) {
    if (!geometry || geometry.magnitudeValue === undefined || geometry.magnitudeValue === null) {
      return "n/d";
    }

    const value = Number(geometry.magnitudeValue);
    const formatted = Number.isFinite(value) ? value.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : String(geometry.magnitudeValue);
    return [formatted, geometry.magnitudeUnit].filter(Boolean).join(" ");
  }

  function setStatus(text) {
    if (statusLabel) {
      statusLabel.textContent = text;
    }
  }

  function setMessage(text) {
    if (message) {
      message.textContent = text;
    }
  }

  function setEONETStatus(text) {
    if (eonetStatus) {
      eonetStatus.textContent = text;
    }
  }

  function readCache(key, cacheTTL = CACHE_TTL) {
    try {
      const raw = window.localStorage.getItem(CACHE_PREFIX + key);
      if (!raw) {
        return null;
      }

      const cached = JSON.parse(raw);
      if (!cached || Date.now() - cached.createdAt > cacheTTL) {
        window.localStorage.removeItem(CACHE_PREFIX + key);
        return null;
      }

      return cached.payload;
    } catch {
      return null;
    }
  }

  function writeCache(key, payload) {
    try {
      window.localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({
        createdAt: Date.now(),
        payload,
      }));
    } catch {
      // Cache is optional; private browsing or quota limits should not break APOD.
    }
  }

  function safeHTTPURL(value) {
    if (!value) {
      return "";
    }

    try {
      const parsed = new URL(value, window.location.href);
      return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : "";
    } catch {
      return "";
    }
  }

  function safeImageURL(value) {
    const safeURL = safeHTTPURL(value);

    if (!safeURL) {
      return "";
    }

    try {
      const parsed = new URL(safeURL);
      const allowed = new Set([
        "apod.nasa.gov",
        "www.nasa.gov",
        "api.nasa.gov",
        "img.youtube.com",
        "i.ytimg.com",
      ]);
      return allowed.has(parsed.hostname) ? parsed.href : "";
    } catch {
      return "";
    }
  }

  function safeFrameURL(value) {
    const safeURL = safeHTTPURL(value);

    if (!safeURL) {
      return "";
    }

    try {
      const parsed = new URL(safeURL);
      const youtubeEmbed = youtubeEmbedURL(parsed);

      if (youtubeEmbed) {
        return youtubeEmbed;
      }

      return parsed.hostname === "www.youtube-nocookie.com" && parsed.pathname.startsWith("/embed/") ? parsed.href : "";
    } catch {
      return "";
    }
  }

  function youtubeEmbedURL(parsed) {
    let videoID = "";

    if (parsed.hostname === "youtu.be") {
      videoID = parsed.pathname.split("/").filter(Boolean)[0] || "";
    }

    if (parsed.hostname === "www.youtube.com" || parsed.hostname === "youtube.com") {
      if (parsed.pathname === "/watch") {
        videoID = parsed.searchParams.get("v") || "";
      } else if (parsed.pathname.startsWith("/embed/") || parsed.pathname.startsWith("/shorts/")) {
        videoID = parsed.pathname.split("/").filter(Boolean)[1] || "";
      }
    }

    if (!/^[A-Za-z0-9_-]{6,}$/.test(videoID)) {
      return "";
    }

    const embed = new URL(`https://www.youtube-nocookie.com/embed/${videoID}`);
    const start = parsed.searchParams.get("start") || parsed.searchParams.get("t");

    if (start && /^\d+$/.test(start)) {
      embed.searchParams.set("start", start);
    }

    return embed.href;
  }
})();
