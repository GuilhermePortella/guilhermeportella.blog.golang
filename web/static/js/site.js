(() => {
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
})();
