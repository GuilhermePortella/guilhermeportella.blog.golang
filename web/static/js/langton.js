(() => {
  'use strict';
  const KEY = 'gp:langton:start:v1';
  const canvas = document.getElementById('ant-canvas'), ctx = canvas.getContext('2d');
  const status = document.getElementById('ant-storage');
  let start = Date.now();
  function readStart(raw) {
    const value = Number(raw);
    return raw !== null && Number.isSafeInteger(value) && value > 0 && value <= Date.now() ? value : null;
  }
  try {
    start = readStart(localStorage.getItem(KEY)) ?? start;
    localStorage.setItem(KEY, String(start));
  } catch {
    status.textContent = 'O navegador bloqueou o armazenamento. A formiga anda nesta visita, mas a jornada não poderá ser recuperada ao fechar a página.';
  }
  if (!ctx) { status.textContent = 'Este navegador não disponibilizou o canvas para desenhar a simulação.'; return; }
  const at = Langton.engine(), format = new Intl.NumberFormat('pt-BR');
  const button = document.getElementById('ant-view');
  let frozen = matchMedia('(prefers-reduced-motion: reduce)').matches, last = -1, state;
  function buttonLabel() { button.textContent = frozen ? 'Acompanhar agora' : 'Congelar visualização'; button.setAttribute('aria-pressed', String(frozen)); }
  buttonLabel();
  button.addEventListener('click', () => { frozen = !frozen; buttonLabel(); render(true); });
  window.addEventListener('storage', event => {
    if (event.key !== KEY && event.key !== null) return;
    const value = readStart(event.newValue);
    if (value !== null) { start = value; last = -1; render(true); }
    else status.textContent = 'O registro da jornada foi removido. Esta visita continua; uma nova visita iniciará outra jornada.';
  });
  function draw() {
    const w = canvas.clientWidth, h = canvas.clientHeight, dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.scale(dpr, dpr); ctx.fillStyle = '#111c24'; ctx.fillRect(0, 0, w, h);
    const size = 12, cols = Math.ceil(w / size / 2), rows = Math.ceil(h / size / 2);
    for (let y = -rows; y <= rows; y++) for (let x = -cols; x <= cols; x++) {
      ctx.fillStyle = state.on(state.x + x, state.y + y) ? '#f6d986' : '#293a42';
      ctx.fillRect(w / 2 + x * size - 5, h / 2 + y * size - 5, 10, 10);
    }
    ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(state.dir * Math.PI / 2);
    ctx.fillStyle = '#ff806c'; ctx.strokeStyle = '#111c24'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(7, 7); ctx.lineTo(-7, 7); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  function render(force = false) {
    if (document.hidden && !force) return;
    const n = Math.max(last, Langton.target(start, Date.now()));
    if ((!frozen || !state) && (n !== last || force)) {
      state = at(n); last = n;
      document.getElementById('ant-steps').textContent = format.format(n);
      document.getElementById('ant-position').textContent = `${format.format(state.x)}, ${format.format(state.y)}`;
      document.getElementById('ant-phase').textContent = n >= 12000 ? 'Na estrada' : 'Explorando';
    }
    document.getElementById('ant-start').textContent = new Date(start).toLocaleString('pt-BR');
    if (state && (!frozen || force)) draw();
  }
  window.addEventListener('resize', () => render(true));
  document.addEventListener('visibilitychange', () => render(true));
  render(true); setInterval(render, 100);
})();
