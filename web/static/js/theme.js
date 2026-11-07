(() => {
    const KEY = "gp:theme:v1";
    const DEFAULT_THEME = "light";
    // Allowlist: qualquer valor fora desta lista (armazenamento adulterado) cai no padrão.
    const THEMES = ["light", "gta", "dark"];
    const DARK_THEMES = ["gta", "dark"];
    const root = document.documentElement;
    let current = read();

    function read() {
        try {
            const value = localStorage.getItem(KEY);
            return THEMES.includes(value) ? value : DEFAULT_THEME;
        } catch { /* Armazenamento indisponível: usa o tema padrão. */ }
        return DEFAULT_THEME;
    }

    function apply(theme) {
        current = THEMES.includes(theme) ? theme : DEFAULT_THEME;
        root.setAttribute("data-theme", current);
        root.toggleAttribute("data-dark", DARK_THEMES.includes(current));
        for (const button of document.querySelectorAll?.("[data-theme-option]") ?? []) {
            button.setAttribute("aria-pressed", String(button.getAttribute("data-theme-option") === current));
        }
    }

    function set(theme) {
        if (!THEMES.includes(theme)) return false;
        apply(theme);
        try { localStorage.setItem(KEY, current); } catch { /* A escolha vale apenas nesta página. */ }
        return true;
    }

    function mount() {
        const group = document.querySelector("[data-theme-switch]");
        if (!group) return;
        for (const button of group.querySelectorAll("[data-theme-option]")) {
            button.addEventListener("click", () => set(button.getAttribute("data-theme-option")));
        }
        group.hidden = false;
        apply(current);
    }

    // Aplicado de forma síncrona no <head> para evitar o flash do tema errado.
    apply(current);

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
    else mount();

    // Sincroniza outras abas.
    window.addEventListener("storage", (event) => {
        if (event.key === KEY) apply(read());
    });

    window.siteTheme = { themes: THEMES, get: () => current, set };
})();

