(function() {
  const STORAGE_KEY = 'interval-timers-v1';

  const TICK_MS = 250;

  let timers = [];
  let editingId = null;
  let runState = null;
  let tickHandle = null;   // fallback setInterval (si Worker indisponible)
  let worker = null;       // source de ticks non throttlée en arrière-plan
  let wakeLock = null;

  const now = () => performance.now();

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
    if (document.visibilityState !== 'visible' || !runState || !runState.running) return;
    // Le worker a continué à égrener le temps en arrière-plan ; au retour, on
    // reprend le wake lock, on réveille l'audio et on recale l'affichage aussitôt.
    requestWakeLock();
    ensureAudio();
    tick();
  });

  // ---------- Runner ----------
  const LABELS = { idle: 'Prêt', work: 'Travail', rest: 'Repos', done: 'Terminé' };
  // Repères sonores/haptiques joués à l'entrée d'une phase (source unique).
  const CUES = {
    rest: () => { beep(500, 0.2); vibrate(150); },
    work: () => { beep(900, 0.2); vibrate(200); },
    done: () => { finalBeep(); vibrate([200, 100, 200, 100, 400]); },
  };

  // Durée (s) d'une phase. 'idle'/'done' n'ont pas de durée propre : on renvoie
  // celle du travail, ce qui donne la bonne barre de progression (0 % / 100 %).
  function phaseDuration(phase) {
    return phase === 'rest' ? runState.timer.rest : runState.timer.work;
  }
  // Positionne la phase de départ (phase + répétition + temps restant) d'un bloc.
  function seedPhase(phase, rep) {
    runState.phase = phase;
    runState.currentRep = rep;
    runState.remaining = phaseDuration(phase);
  }

  function openRun(id) {
    const t = timers.find(x => x.id === id);
    if (!t) return;
    runState = {
      timer: t,
      currentRep: 1,
      phase: 'idle',
      remaining: t.work,
      phaseEndAt: 0,   // instant (performance.now) de fin de phase courante
      running: false
    };
    document.getElementById('run-title').textContent = t.name;
    updateRunner();
    show('screen-run');
  }

  function updateRunner() {
    const { timer, currentRep, phase, remaining, running } = runState;
    // Tout l'affichage se dérive de ces champs : on saute le rendu tant qu'ils
    // n'ont pas bougé (les ticks tombent 4x/s, l'affichage change ~1x/s).
    const sig = phase + '|' + remaining + '|' + currentRep + '|' + running;
    if (runState.lastRender === sig) return;
    runState.lastRender = sig;

    document.getElementById('runner').className = 'runner ' + phase;
    document.getElementById('phase').textContent = LABELS[phase];

    const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
    const ss = String(remaining % 60).padStart(2, '0');
    document.getElementById('time').textContent = `${mm}:${ss}`;

    document.getElementById('reps').textContent =
      phase === 'done' ? 'Bravo, séance terminée 💪' : `Répétition ${currentRep} / ${timer.reps}`;

    const total = phaseDuration(phase);
    const pct = total > 0 ? ((total - remaining) / total) * 100 : 0;
    document.getElementById('progress').style.width = `${pct}%`;

    document.getElementById('btn-play').textContent = running ? 'Pause' : (phase === 'done' ? 'Recommencer' : 'Démarrer');
  }

  // Phase suivante dans la séquence work -> (rest?) -> work ... -> done.
  // Retourne { phase, rep, duration } ou { phase: 'done' }. Toutes les durées
  // sont >= 1 s (work min 1, rest sauté si 0) : pas de phase à durée nulle.
  function nextPhase(phase, rep) {
    const t = runState.timer;
    if (phase === 'work') {
      if (rep >= t.reps) return { phase: 'done' };
      if (t.rest > 0) return { phase: 'rest', rep, duration: t.rest };
      return { phase: 'work', rep: rep + 1, duration: t.work };
    }
    // fin d'un repos -> répétition suivante
    return { phase: 'work', rep: rep + 1, duration: t.work };
  }

  // ---------- Ticks (worker non throttlé, fallback setInterval) ----------
  function startTicks() {
    stopTicks();
    if (worker) worker.postMessage({ type: 'start', interval: TICK_MS });
    else tickHandle = setInterval(tick, TICK_MS);
  }
  function stopTicks() {
    if (worker) worker.postMessage({ type: 'stop' });
    if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
  }

  // Un tick ne mesure rien : il recale `remaining` sur l'horloge réelle et fait
  // avancer la ou les phases dont l'échéance est passée. Si l'app est restée en
  // arrière-plan, plusieurs phases peuvent être franchies d'un coup — on ne joue
  // alors que le repère de la phase où l'on atterrit (pas de spam de bips).
  function tick() {
    if (!runState || !runState.running) return;
    const t = now();

    let entered = null;
    while (runState.phase !== 'done' && t >= runState.phaseEndAt) {
      const nx = nextPhase(runState.phase, runState.currentRep);
      if (nx.phase === 'done') { runState.phase = 'done'; entered = 'done'; break; }
      runState.phase = nx.phase;
      runState.currentRep = nx.rep;
      runState.phaseEndAt += nx.duration * 1000;
      entered = nx.phase;
    }

    if (entered === 'done') {
      finishRun();
      updateRunner();
      return;
    }

    const prev = runState.remaining;
    runState.remaining = Math.max(0, Math.ceil((runState.phaseEndAt - t) / 1000));

    if (entered) CUES[entered]();   // entrée d'une nouvelle phase (rest/work)
    // Décompte des 3 dernières secondes, au passage de chaque seconde entière.
    else if (runState.remaining < prev && runState.remaining >= 1 && runState.remaining <= 3) {
      beep(700, 0.08);
    }

    updateRunner();
  }

  function finishRun() {
    runState.phase = 'done';
    runState.running = false;
    runState.remaining = 0;
    stopTicks();
    CUES.done();
    releaseWakeLock();
  }

  function togglePlay() {
    if (!runState) return;
    // Depuis 'idle' ou 'done', (re)démarre au début du travail ; sinon on reprend
    // la phase en cours là où elle en était (pause).
    if (runState.phase === 'idle' || runState.phase === 'done') seedPhase('work', 1);
    runState.running = !runState.running;
    if (runState.running) {
      ensureAudio();
      requestWakeLock();
      // Ancre la fin de phase sur l'horloge réelle (reprend `remaining` tel quel).
      runState.phaseEndAt = now() + runState.remaining * 1000;
      startTicks();
    } else {
      stopTicks();
      releaseWakeLock();
    }
    updateRunner();
  }

  function resetRun() {
    if (!runState) return;
    stopTicks();
    releaseWakeLock();
    seedPhase('idle', 1);
    runState.phaseEndAt = 0;
    runState.running = false;
    updateRunner();
  }

  function exitRun() {
    stopTicks();
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

  // PWA: invite d'installation + invite de mise à jour (au lieu d'un reload silencieux
  // qui couperait un timer en cours). Silencieux sur file:// / navigateurs non compatibles.
  setupPWA();

  // Source de ticks : Web Worker (non throttlé écran verrouillé), fallback setInterval.
  try { worker = new Worker('./scheduler.worker.js'); worker.onmessage = tick; }
  catch (e) { worker = null; }

  loadTimers();
  renderList();

  // ---------- PWA : invite d'installation + invite de mise à jour ----------
  function setupPWA() {
    const bar = document.getElementById('app-bar');
    if (!bar) return;
    const DISMISS_KEY = 'interval-timer-install-dismissed';
    const barText = document.getElementById('app-bar-text');
    const barAction = document.getElementById('app-bar-action');
    const barClose = document.getElementById('app-bar-close');
    let mode = null;               // 'install' | 'update'
    let deferredPrompt = null, waitingWorker = null;

    const standalone = () =>
      window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    const dismissed = () => {
      try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch (e) { return false; }
    };

    // La mise à jour est prioritaire sur l'invite d'installation.
    function offerUpdate(worker) {
      waitingWorker = worker; mode = 'update';
      barText.textContent = 'Nouvelle version disponible.';
      barAction.textContent = 'Recharger'; barAction.hidden = false; barAction.disabled = false;
      bar.hidden = false;
    }
    function offerInstall(kind) {
      if (mode === 'update' || standalone() || dismissed()) return;
      mode = 'install';
      if (kind === 'ios') {
        barText.textContent = "Installer : Partager, puis « Sur l'écran d'accueil ».";
        barAction.hidden = true;
      } else {
        barText.textContent = "Installez l'app sur votre écran d'accueil.";
        barAction.textContent = 'Installer'; barAction.hidden = false; barAction.disabled = false;
      }
      bar.hidden = false;
    }

    barAction.addEventListener('click', () => {
      if (mode === 'update' && waitingWorker) {
        barAction.disabled = true; barText.textContent = 'Mise à jour…';
        waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      } else if (mode === 'install' && deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.catch(() => {}).then(() => { deferredPrompt = null; bar.hidden = true; mode = null; });
      }
    });
    barClose.addEventListener('click', () => {
      bar.hidden = true;
      if (mode === 'install') { try { localStorage.setItem(DISMISS_KEY, '1'); } catch (e) {} }
      mode = null;
    });

    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; offerInstall(); });
    window.addEventListener('appinstalled', () => {
      deferredPrompt = null; if (mode === 'install') { bar.hidden = true; mode = null; }
    });

    // iOS Safari n'émet jamais beforeinstallprompt → invite manuelle.
    // iPadOS se présente comme un Mac : détecté via l'écran tactile.
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isSafari = /^((?!chrome|crios|fxios|android).)*safari/i.test(navigator.userAgent);
    if (isIOS && isSafari) setTimeout(() => offerInstall('ios'), 2500);

    if ('serviceWorker' in navigator) {
      let refreshing = false;
      let hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController) { hadController = true; return; }   // 1er install : pas de reload
        if (refreshing) return; refreshing = true; window.location.reload();
      });
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then((reg) => {
          if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
          reg.addEventListener('updatefound', () => {
            const nw = reg.installing;
            if (!nw) return;
            nw.addEventListener('statechange', () => {
              if (nw.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(nw);
            });
          });
          // Au retour au premier plan, au plus une fois / 30 min (évite un fetch de sw.js
          // à chaque bascule pendant une séance).
          let lastUpdate = 0;
          document.addEventListener('visibilitychange', () => {
            if (document.visibilityState !== 'visible') return;
            const now = Date.now();
            if (now - lastUpdate < 1800000) return;
            lastUpdate = now; reg.update();
          });
        }).catch(() => {});
      });
    }
  }
})();
