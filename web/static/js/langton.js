(() => {
  'use strict';
  const KEY = 'gp:langton:start:v1', CLOCK_KEY = 'gp:langton:clock:v1';
  const rates = [1, 5, 25, 100, 1000];
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
  const speed = document.getElementById('ant-speed');
  const speedDefault = document.getElementById('ant-speed-default');
  const speedDown = document.getElementById('ant-speed-down'), speedUp = document.getElementById('ant-speed-up');
  let clock = { start, at: start, steps: 0, rate: 5 };
  function speedLabel() {
    speed.textContent = `${format.format(clock.rate)} ${clock.rate === 1 ? 'passo/s' : 'passos/s'}`;
    speedDefault.setAttribute('aria-pressed', String(clock.rate === 5));
    speedDown.disabled = clock.rate === rates[0];
    speedUp.disabled = clock.rate === rates[rates.length - 1];
  }
  function readClock() {
    try {
      const saved = JSON.parse(localStorage.getItem(CLOCK_KEY));
      if (saved && saved.start === start && Number.isSafeInteger(saved.at) && saved.at >= start && saved.at <= Date.now()
          && Number.isFinite(saved.steps) && saved.steps >= 0 && saved.steps <= Number.MAX_SAFE_INTEGER
          && rates.includes(saved.rate)) clock = saved;
    } catch { /* Keep the current clock when storage is unavailable or malformed. */ }
    speedLabel();
  }
  function progress(now) {
    return Math.min(Number.MAX_SAFE_INTEGER, clock.steps + Math.max(0, now - clock.at) * clock.rate / 1000);
  }
  readClock();
  function changeSpeed(rate) {
    if (!rates.includes(rate)) return;
    const now = Date.now();
    clock = { start, at: now, steps: progress(now), rate };
    speedLabel();
    try { localStorage.setItem(CLOCK_KEY, JSON.stringify(clock)); }
    catch { status.textContent = 'A velocidade vale nesta visita, mas o navegador não permitiu salvar a mudança.'; }
    render(true);
  }
  speedDefault.addEventListener('click', () => { readClock(); changeSpeed(5); });
  function adjustSpeed(delta) {
    readClock();
    changeSpeed(rates[rates.indexOf(clock.rate) + delta]);
  }
  speedDown.addEventListener('click', () => adjustSpeed(-1));
  speedUp.addEventListener('click', () => adjustSpeed(1));
  let frozen = matchMedia('(prefers-reduced-motion: reduce)').matches, last = -1, state;
  function buttonLabel() { button.textContent = frozen ? 'Acompanhar agora' : 'Congelar visualização'; button.setAttribute('aria-pressed', String(frozen)); }
  buttonLabel();
  button.addEventListener('click', () => { frozen = !frozen; buttonLabel(); render(true); });
  window.addEventListener('storage', event => {
    if (event.key === CLOCK_KEY) { readClock(); render(true); return; }
    if (event.key !== KEY && event.key !== null) return;
    const value = readStart(event.newValue);
    if (value !== null) {
      start = value; clock = { start, at: start, steps: 0, rate: 5 };
      readClock(); last = -1; state = null; render(true);
    } else status.textContent = 'O registro da jornada foi removido. Esta visita continua; uma nova visita iniciará outra jornada.';
  });
  const camera = { x: 0, y: 0, size: 12, follow: true };
  const follow = document.getElementById('ant-follow');
  const zoomOut = document.getElementById('ant-zoom-out'), zoomIn = document.getElementById('ant-zoom-in');
  function cameraLabel() {
    follow.setAttribute('aria-pressed', String(camera.follow));
    document.getElementById('ant-camera').textContent = camera.follow ? 'A câmera acompanha a formiga' : 'Explorando a grade';
    document.getElementById('ant-zoom').textContent = `${Math.round(camera.size / 12 * 100)}%`;
    zoomOut.disabled = camera.size <= 4; zoomIn.disabled = camera.size >= 36;
  }
  function pan(dx, dy) {
    camera.follow = false;
    camera.x += dx / camera.size; camera.y += dy / camera.size;
    draw();
  }
  function zoom(factor, x = canvas.clientWidth / 2, y = canvas.clientHeight / 2) {
    const size = Math.max(4, Math.min(36, camera.size * factor));
    if (size === camera.size) return;
    // Keep the world point under the cursor stationary while exploring.
    if (!camera.follow) {
      camera.x += (x - canvas.clientWidth / 2) * (1 / camera.size - 1 / size);
      camera.y += (y - canvas.clientHeight / 2) * (1 / camera.size - 1 / size);
    }
    camera.size = size; draw();
  }
  zoomOut.addEventListener('click', () => zoom(1 / 1.25));
  zoomIn.addEventListener('click', () => zoom(1.25));
  document.getElementById('ant-origin').addEventListener('click', () => {
    camera.follow = false; camera.x = 0; camera.y = 0; draw();
  });
  follow.addEventListener('click', () => { camera.follow = true; draw(); });
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    zoom(Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * 0.002), event.clientX - rect.left, event.clientY - rect.top);
  }, { passive: false });
  let drag;
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 || drag) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId); canvas.focus({ preventScroll: true });
  });
  canvas.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    pan(drag.x - event.clientX, drag.y - event.clientY);
    drag.x = event.clientX; drag.y = event.clientY;
  });
  function endDrag(event) { if (drag && event.pointerId === drag.id) drag = null; }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('lostpointercapture', endDrag);
  canvas.addEventListener('keydown', event => {
    const moves = { ArrowLeft: [-60, 0], ArrowRight: [60, 0], ArrowUp: [0, -60], ArrowDown: [0, 60] };
    if (moves[event.key]) { event.preventDefault(); pan(...moves[event.key]); }
    else if (['+', '=', '-'].includes(event.key)) { event.preventDefault(); zoom(event.key === '-' ? 1 / 1.25 : 1.25); }
    else if (event.key === 'Home') { event.preventDefault(); camera.follow = true; draw(); }
  });
  function draw() {
    const w = canvas.clientWidth, h = canvas.clientHeight, dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.scale(dpr, dpr); ctx.fillStyle = '#111c24'; ctx.fillRect(0, 0, w, h);
    if (camera.follow) { camera.x = state.x; camera.y = state.y; }
    cameraLabel();
    const size = camera.size, cell = Math.max(1, size - 2);
    const cols = Math.ceil(w / size / 2) + 1, rows = Math.ceil(h / size / 2) + 1;
    const cx = Math.floor(camera.x), cy = Math.floor(camera.y);
    for (let y = cy - rows; y <= cy + rows; y++) for (let x = cx - cols; x <= cx + cols; x++) {
      ctx.fillStyle = state.on(x, y) ? '#f6d986' : '#293a42';
      ctx.fillRect(w / 2 + (x - camera.x) * size - cell / 2, h / 2 + (y - camera.y) * size - cell / 2, cell, cell);
    }
    ctx.save(); ctx.translate(w / 2 + (state.x - camera.x) * size, h / 2 + (state.y - camera.y) * size);
    ctx.rotate(state.dir * Math.PI / 2); ctx.scale(size / 12, size / 12);
    ctx.fillStyle = '#ff806c'; ctx.strokeStyle = '#111c24'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(7, 7); ctx.lineTo(-7, 7); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  function render(force = false) {
    if (document.hidden && !force) return;
    const n = Math.max(last, Math.floor(progress(Date.now())));
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
