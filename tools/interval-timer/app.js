(function() {
  const STORAGE_KEY = 'interval-timers-v1';

  let timers = [];
  let editingId = null;
  let runState = null;
  let tickHandle = null;
  let wakeLock = null;

  // ---------- Storage (localStorage) ----------
  function loadTimers() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      timers = raw ? JSON.parse(raw) : [];
    } catch (e) {
      timers = [];
    }
  }
  function saveTimers() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(timers));
    } catch (e) {
      console.error('Save failed', e);
    }
  }

  // ---------- Navigation ----------
  function show(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
  }

  // ---------- List ----------
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function renderList() {
    const el = document.getElementById('list-container');
    if (timers.length === 0) {
      el.innerHTML = `
        <div class="empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="13" r="8"/>
            <path d="M12 9v4l2 2M9 2h6"/>
          </svg>
          <div>Aucun timer pour le moment.<br/>Appuie sur + pour en créer un.</div>
        </div>`;
      return;
    }
    el.innerHTML = timers.map(t => `
      <div class="list-item">
        <div class="list-main" data-run="${t.id}">
          <div class="list-name">${escapeHtml(t.name)}</div>
          <div class="list-meta">${t.work}s travail · ${t.rest}s repos · ${t.reps} rép.</div>
        </div>
        <button class="icon-btn" data-edit="${t.id}" aria-label="Éditer">✎</button>
        <button class="icon-btn danger" data-delete="${t.id}" aria-label="Supprimer">🗑</button>
      </div>
    `).join('');
  }

  // ---------- Edit ----------
  function openEdit(id) {
    editingId = id;
    const t = id ? timers.find(x => x.id === id) : null;
    document.getElementById('edit-title').textContent = t ? 'Éditer' : 'Nouveau';
    document.getElementById('f-name').value = t?.name ?? '';
    document.getElementById('f-work').value = t?.work ?? 30;
    document.getElementById('f-rest').value = t?.rest ?? 15;
    document.getElementById('f-reps').value = t?.reps ?? 8;
    show('screen-edit');
  }

  function saveCurrent() {
    const name = document.getElementById('f-name').value.trim() || 'Sans nom';
    const work = Math.max(1, parseInt(document.getElementById('f-work').value) || 30);
    const rest = Math.max(0, parseInt(document.getElementById('f-rest').value) || 0);
    const reps = Math.max(1, parseInt(document.getElementById('f-reps').value) || 1);

    if (editingId) {
      const t = timers.find(x => x.id === editingId);
      Object.assign(t, { name, work, rest, reps });
    } else {
      timers.unshift({
        id: 'tmr_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6),
        name, work, rest, reps
      });
    }
    saveTimers();
    renderList();
    show('screen-list');
  }

  function deleteTimer(id) {
    timers = timers.filter(t => t.id !== id);
    saveTimers();
    renderList();
  }

  // ---------- Wake Lock ----------
  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        wakeLock = await navigator.wakeLock.request('screen');
      }
    } catch (e) {
      console.warn('Wake lock failed', e);
    }
  }
  function releaseWakeLock() {
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && runState && runState.running) {
      requestWakeLock();
    }
  });

  // ---------- Runner ----------
  function openRun(id) {
    const t = timers.find(x => x.id === id);
    if (!t) return;
    runState = {
      timer: t,
      currentRep: 1,
      phase: 'idle',
      remaining: t.work,
      running: false
    };
    document.getElementById('run-title').textContent = t.name;
    updateRunner();
    show('screen-run');
  }

  function updateRunner() {
    const { timer, currentRep, phase, remaining } = runState;
    const runner = document.getElementById('runner');
    runner.className = 'runner ' + phase;

    const labels = { idle: 'Prêt', work: 'Travail', rest: 'Repos', done: 'Terminé' };
    document.getElementById('phase').textContent = labels[phase];

    const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
    const ss = String(remaining % 60).padStart(2, '0');
    document.getElementById('time').textContent = `${mm}:${ss}`;

    document.getElementById('reps').textContent =
      phase === 'done' ? 'Bravo, séance terminée 💪' : `Répétition ${currentRep} / ${timer.reps}`;

    const total = phase === 'rest' ? timer.rest : timer.work;
    const pct = total > 0 ? ((total - remaining) / total) * 100 : 0;
    document.getElementById('progress').style.width = `${pct}%`;

    document.getElementById('btn-play').textContent = runState.running ? 'Pause' : (phase === 'done' ? 'Recommencer' : 'Démarrer');
  }

  function tick() {
    if (!runState || !runState.running) return;
    runState.remaining -= 1;

    if (runState.remaining <= 3 && runState.remaining > 0) {
      beep(700, 0.08);
    }

    if (runState.remaining <= 0) {
      const t = runState.timer;
      if (runState.phase === 'rest') {
        runState.currentRep += 1;
        runState.phase = 'work';
        runState.remaining = t.work;
        beep(900, 0.2);
        vibrate(200);
      } else if (runState.phase === 'work') {
        if (runState.currentRep >= t.reps) {
          runState.phase = 'done';
          runState.running = false;
          runState.remaining = 0;
          clearInterval(tickHandle);
          tickHandle = null;
          finalBeep();
          vibrate([200, 100, 200, 100, 400]);
          releaseWakeLock();
        } else if (t.rest > 0) {
          runState.phase = 'rest';
          runState.remaining = t.rest;
          beep(500, 0.2);
          vibrate(150);
        } else {
          runState.currentRep += 1;
          runState.remaining = t.work;
          beep(900, 0.2);
          vibrate(200);
        }
      }
    }
    updateRunner();
  }

  function togglePlay() {
    if (!runState) return;
    if (runState.phase === 'done') {
      runState.currentRep = 1;
      runState.phase = 'work';
      runState.remaining = runState.timer.work;
    } else if (runState.phase === 'idle') {
      runState.phase = 'work';
      runState.remaining = runState.timer.work;
    }
    runState.running = !runState.running;
    if (runState.running) {
      ensureAudio();
      requestWakeLock();
      if (tickHandle) clearInterval(tickHandle);
      tickHandle = setInterval(tick, 1000);
    } else {
      if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
      releaseWakeLock();
    }
    updateRunner();
  }

  function resetRun() {
    if (!runState) return;
    if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
    releaseWakeLock();
    runState.currentRep = 1;
    runState.phase = 'idle';
    runState.remaining = runState.timer.work;
    runState.running = false;
    updateRunner();
  }

  function exitRun() {
    if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
    releaseWakeLock();
    runState = null;
    show('screen-list');
  }

  // ---------- Audio + Haptics ----------
  let audioCtx = null;
  function ensureAudio() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) {}
  }
  function beep(freq = 800, dur = 0.15) {
    try {
      ensureAudio();
      if (!audioCtx) return;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.value = freq;
      o.type = 'sine';
      o.connect(g); g.connect(audioCtx.destination);
      g.gain.setValueAtTime(0.3, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
    } catch (e) {}
  }
  function finalBeep() {
    beep(900, 0.2);
    setTimeout(() => beep(1100, 0.3), 220);
    setTimeout(() => beep(1300, 0.4), 500);
  }
  function vibrate(pattern) {
    if (navigator.vibrate) try { navigator.vibrate(pattern); } catch (e) {}
  }

  // ---------- Event wiring ----------
  document.getElementById('btn-new').addEventListener('click', () => openEdit(null));
  document.getElementById('btn-back-edit').addEventListener('click', () => show('screen-list'));
  document.getElementById('btn-save').addEventListener('click', saveCurrent);
  document.getElementById('btn-back-run').addEventListener('click', exitRun);
  document.getElementById('btn-play').addEventListener('click', togglePlay);
  document.getElementById('btn-reset').addEventListener('click', resetRun);

  document.querySelectorAll('[data-step]').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.getAttribute('data-step'));
      const delta = parseInt(btn.getAttribute('data-delta'));
      const min = parseInt(input.min);
      const max = parseInt(input.max);
      const cur = parseInt(input.value) || 0;
      const next = Math.min(max, Math.max(min, cur + delta));
      input.value = next;
    });
  });

  document.getElementById('list-container').addEventListener('click', (e) => {
    const del = e.target.closest('[data-delete]');
    const edit = e.target.closest('[data-edit]');
    const run = e.target.closest('[data-run]');
    if (del) {
      if (confirm('Supprimer ce timer ?')) deleteTimer(del.getAttribute('data-delete'));
    } else if (edit) {
      openEdit(edit.getAttribute('data-edit'));
    } else if (run) {
      openRun(run.getAttribute('data-run'));
    }
  });

  // Prevent zoom on double-tap
  let lastTouch = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouch < 300) e.preventDefault();
    lastTouch = now;
  }, { passive: false });

  // Service worker (silently fails on file:// or unsupported browsers)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }

  loadTimers();
  renderList();
})();
