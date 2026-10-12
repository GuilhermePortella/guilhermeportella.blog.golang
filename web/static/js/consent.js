(() => {
  const KEY = "gp:external-media-consent:v1";
  const TTL = 180 * 24 * 60 * 60 * 1000;
  const panel = document.querySelector("[data-consent-panel]");
  const status = document.querySelector("[data-consent-status]");
  const frames = new Map();
  let returnFocus;
  let choice = read();

  function read() {
    try {
      const value = JSON.parse(localStorage.getItem(KEY));
      if (value?.version === 1 && typeof value.allowed === "boolean" &&
          Number.isFinite(value.savedAt) && value.savedAt <= Date.now() &&
          Date.now() - value.savedAt < TTL) return value;
    } catch { /* Unavailable or invalid storage means no permission. */ }
    return null;
  }

  function openPreferences() {
    if (!panel) return;
    returnFocus = document.activeElement;
    panel.hidden = false;
    panel.querySelector("button").focus();
  }

  function render(host, options) {
    host.replaceChildren();
    if (choice?.allowed) {
      const frame = document.createElement("iframe");
      frame.title = options.title;
      frame.src = options.src;
      frame.width = "100%";
      if (options.height) frame.height = options.height;
      frame.loading = "lazy";
      frame.allow = "autoplay; encrypted-media; fullscreen; picture-in-picture";
      frame.allowFullscreen = true;
      host.append(frame);
    } else {
      const text = document.createElement("p");
      text.textContent = `${options.title}: autorize conteúdos externos para carregar este player.`;
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Escolher preferências";
      button.addEventListener("click", openPreferences);
      host.append(text, button);
    }
  }

  function update() {
    for (const [host, options] of frames) {
      if (host.isConnected) render(host, options);
      else frames.delete(host);
    }
    if (panel) panel.hidden = choice !== null;
  }

  function save(allowed) {
    choice = { version: 1, allowed, savedAt: Date.now() };
    let persisted = true;
    try { localStorage.setItem(KEY, JSON.stringify(choice)); }
    catch { persisted = false; }
    update();
    if (status) status.textContent = `${allowed ? "Conteúdos externos autorizados." : "Conteúdos externos bloqueados."}${persisted ? "" : " A preferência vale apenas nesta página porque o armazenamento está indisponível."}`;
    const target = returnFocus?.isConnected ? returnFocus : document.querySelector("[data-consent-open]");
    target?.focus();
  }

  window.siteConsent = {
    mount(host, options) {
      // Only supported providers can create an embedded frame.
      try {
        const url = new URL(options.src);
        if (url.protocol !== "https:" ||
            !["open.spotify.com", "www.youtube.com", "www.youtube-nocookie.com"].includes(url.hostname)) return;
      } catch { return; }
      host.classList.add("external-media");
      frames.set(host, options);
      render(host, options);
    },
  };

  document.querySelectorAll("[data-consent-open]").forEach((button) => {
    button.hidden = false;
    button.addEventListener("click", openPreferences);
  });
  document.querySelector("[data-consent-accept]")?.addEventListener("click", () => save(true));
  document.querySelector("[data-consent-reject]")?.addEventListener("click", () => save(false));
  window.addEventListener("storage", (event) => {
    if (event.key === KEY || event.key === null) { choice = read(); update(); }
  });
  window.addEventListener("focus", () => {
    if (choice && Date.now() - choice.savedAt >= TTL) { choice = null; update(); }
  });
  update();
})();
