(() => {
    const KEY = "gp:theme:v1";
    const DEFAULT_THEME = "gta";
    // Allowlist: qualquer valor fora desta lista (armazenamento adulterado) cai no padrão.
    const THEMES = ["light", "gta", "dark"];
    const DARK_THEMES = ["gta", "dark"];
    const root = document.documentElement;
    let current = read();
    let labelElement = null;

    function read() {
        try {
            const value = localStorage.getItem(KEY);
            return THEMES.includes(value) ? value : DEFAULT_THEME;
        } catch { /* Armazenamento indisponível: usa o tema padrão. */ }
        return DEFAULT_THEME;
    }

    // Pinta a página com o tema informado, sem alterar a escolha salva.
    function paint(theme) {
        root.setAttribute("data-theme", theme);
        root.toggleAttribute("data-dark", DARK_THEMES.includes(theme));
    }

    function apply(theme) {
        current = THEMES.includes(theme) ? theme : DEFAULT_THEME;
        paint(current);
        for (const button of document.querySelectorAll?.("[data-theme-option]") ?? []) {
            const active = button.getAttribute("data-theme-option") === current;
            button.setAttribute("aria-pressed", String(active));
            if (active && labelElement) labelElement.textContent = button.getAttribute("data-theme-name") ?? current;
        }
    }

    // Prévia temporária (hover/foco na galeria): não persiste nem muda o tema escolhido.
    function preview(theme) {
        if (THEMES.includes(theme)) paint(theme);
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

        const opener = group.querySelector?.("[data-theme-open]") ?? null;
        const dialog = group.querySelector?.("[data-theme-dialog]") ?? null;
        labelElement = group.querySelector?.("[data-theme-current-label]") ?? null;
        const options = [...group.querySelectorAll("[data-theme-option]")];

        function openDialog() {
            if (!dialog) return;
            if (typeof dialog.showModal === "function") {
                if (!dialog.open) dialog.showModal();
            } else {
                dialog.setAttribute("open", "");
            }
            opener?.setAttribute("aria-expanded", "true");
            // O foco inicial vai para o tema ativo, facilitando a navegação por setas.
            options.find((button) => button.getAttribute("data-theme-option") === current)?.focus?.();
        }

        function handleClosed() {
            paint(current);
            opener?.setAttribute("aria-expanded", "false");
        }

        function closeDialog() {
            if (!dialog) return;
            if (typeof dialog.close === "function") {
                dialog.close();
            } else {
                dialog.removeAttribute("open");
                handleClosed();
            }
        }

        options.forEach((button, index) => {
            const theme = button.getAttribute("data-theme-option");
            button.addEventListener("click", () => {
                if (set(theme)) closeDialog();
            });
            button.addEventListener("pointerenter", (event) => {
                if (event?.pointerType !== "touch") preview(theme);
            });
            button.addEventListener("pointerleave", () => preview(current));
            button.addEventListener("focus", () => preview(theme));
            button.addEventListener("blur", () => preview(current));
            button.addEventListener("keydown", (event) => {
                let step = 0;
                if (event.key === "ArrowRight" || event.key === "ArrowDown") step = 1;
                else if (event.key === "ArrowLeft" || event.key === "ArrowUp") step = -1;
                if (!step) return;
                event.preventDefault();
                options[(index + step + options.length) % options.length].focus?.();
            });
        });

        if (dialog) {
            opener?.addEventListener("click", openDialog);
            dialog.addEventListener("close", handleClosed);
            // Clique no fundo (fora do painel) fecha a galeria.
            dialog.addEventListener("click", (event) => {
                if (event.target === dialog) closeDialog();
            });
            for (const button of dialog.querySelectorAll("[data-theme-close]")) {
                button.addEventListener("click", closeDialog);
            }
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
