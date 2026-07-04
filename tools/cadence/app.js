(function () {
  'use strict';

  // ---------- Constantes (bornes centralisées, cf. FR-1/FR-4) ----------
  var CAD_MIN = 120;
  var CAD_MAX = 220;
  var DEFAULT_CADENCE = 172;
  var CHIPS = [165, 170, 175, 180];
  var VOL = [0.2, 0.45, 0.7, 1.0];
  var SOUNDS = [
    { id: 'bois', label: 'Bloc', desc: 'bois chaud' },
    { id: 'clic', label: 'Clic', desc: 'sec, net' },
    { id: 'toc', label: 'Toc', desc: 'sourd, grave' },
    { id: 'onde', label: 'Onde', desc: 'douce, ronde' },
    { id: 'rim', label: 'Claque', desc: 'sèche, aiguë' },
  ];
  var PATTERNS = [
    { id: 'lr', label: 'Deux appuis' },
    { id: 'strong', label: 'Temps fort' },
  ];

  var LOOKAHEAD = 0.1;      // fenêtre de planification (s) — NFR-3
  var TICK_MS = 25;         // cadence du worker
  var STORAGE_KEY = 'cadence-prefs-v1';

  // ---------- État ----------
  var state = {
    cadence: DEFAULT_CADENCE,
    running: false,
    sound: 'bois',
    volIndex: 2,
    pattern: 'lr',
    tapCount: 0,
  };

  // ---------- Persistance (FR-19) ----------
  function loadPrefs() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var p = JSON.parse(raw);
      if (typeof p.cadence === 'number') state.cadence = clamp(p.cadence);
      if (SOUNDS.some(function (s) { return s.id === p.sound; })) state.sound = p.sound;
      if (typeof p.volIndex === 'number' && p.volIndex >= 0 && p.volIndex < VOL.length) state.volIndex = p.volIndex;
      if (p.pattern === 'lr' || p.pattern === 'strong') state.pattern = p.pattern;
    } catch (e) { /* défauts */ }
  }
  function savePrefs() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        cadence: state.cadence, sound: state.sound, volIndex: state.volIndex, pattern: state.pattern,
      }));
    } catch (e) { /* ignore quota */ }
  }
  // Coalesce les écritures rapprochées : l'appui maintenu et le tap-tempo appellent
  // setCadence des dizaines de fois/s ; on ne persiste qu'une fois la salve retombée.
  var saveT = null;
  function savePrefsSoon() {
    if (saveT) return;
    saveT = setTimeout(function () { saveT = null; savePrefs(); }, 400);
  }

  // ---------- Utilitaires ----------
  function clamp(v) { return Math.max(CAD_MIN, Math.min(CAD_MAX, Math.round(v))); }
  function fmt(s) {
    s = Math.max(0, Math.floor(s));
    var m = Math.floor(s / 60), r = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
  }

  // ---------- Références DOM ----------
  var $ = function (id) { return document.getElementById(id); };
  var app = $('app');
  var el = {
    cadence: $('cadence'), chrono: $('chrono'),
    statusLabel: $('status-label'),
    padL: $('pad-l'), padR: $('pad-r'),
    tapSub: $('tap-sub'), soundValue: $('sound-value'), soundBtn: $('sound-btn'),
    startIcon: $('start-icon'), startLabel: $('start-label'), start: $('start'),
    chips: $('chips'), soundList: $('sound-list'), volCells: $('vol-cells'), patterns: $('patterns'),
  };

  // ---------- Audio ----------
  var audioCtx = null, master = null, noiseBuf = null;
  var reduceMotion = false;

  function ensureAudio() {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
      master = audioCtx.createGain();
      master.gain.value = VOL[state.volIndex];
      master.connect(audioCtx.destination);
      var len = Math.floor(audioCtx.sampleRate * 0.3);
      noiseBuf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }

  // Alternance de hauteur L/R : pied gauche (foot 0) plus grave, droit (foot 1) plus aigu — FR-10.
  function playSound(id, foot, t) {
    var ctx = audioCtx;
    var base = foot === 1 ? 1.05 : 1.0;
    var patGain = state.pattern === 'strong' ? (foot === 0 ? 1.0 : 0.4) : 1.0;
    var g = ctx.createGain(); g.gain.value = patGain; g.connect(master);

    function tone(freq, type, peak, dec) {
      var o = ctx.createOscillator(); o.type = type; o.frequency.value = freq * base;
      var e = ctx.createGain(); o.connect(e); e.connect(g);
      e.gain.setValueAtTime(0.0001, t);
      e.gain.linearRampToValueAtTime(peak, t + 0.004);
      e.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      o.start(t); o.stop(t + dec + 0.03);
    }
    function noise(peak, dec, ft, ff) {
      var s = ctx.createBufferSource(); s.buffer = noiseBuf;
      var f = ctx.createBiquadFilter(); f.type = ft; f.frequency.value = ff * base;
      var e = ctx.createGain(); s.connect(f); f.connect(e); e.connect(g);
      e.gain.setValueAtTime(peak, t);
      e.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      s.start(t); s.stop(t + dec + 0.03);
    }
    switch (id) {
      case 'clic': tone(1650, 'sine', 0.9, 0.05); break;
      case 'bois': tone(880, 'triangle', 0.7, 0.09); noise(0.32, 0.06, 'bandpass', 2000); break;
      case 'toc': tone(430, 'sine', 0.95, 0.13); break;
      case 'onde': tone(680, 'sine', 0.6, 0.2); break;
      case 'rim': noise(0.6, 0.045, 'highpass', 3200); tone(2200, 'square', 0.22, 0.03); break;
      default: tone(880, 'triangle', 0.7, 0.09);
    }
  }

  // Aperçu au choix d'un son : L puis R (FR-12).
  function preview(id) {
    ensureAudio();
    var t = audioCtx.currentTime + 0.03;
    var step = Math.min(0.24, 60 / state.cadence);
    playSound(id, 0, t);
    playSound(id, 1, t + step);
    setTimeout(function () { pulse(0); }, 30);
    setTimeout(function () { pulse(1); }, 30 + step * 1000);
  }

  // ---------- Scheduler piloté par le worker (NFR-1/2/3) ----------
  var worker = null, schedTimer = null;
  var nextNote = 0, foot = 0, queue = [], startTime = 0, rafId = 0;
  var lastSec = -1;   // dernier entier de seconde affiché (évite de réécrire le chrono à chaque frame)

  function scheduler() {
    if (!audioCtx) return;
    var horizon = audioCtx.currentTime + LOOKAHEAD;
    var step = 60 / state.cadence;   // intervalle courant ; une cadence changée à chaud s'applique dès le tick suivant (FR-6)
    var visible = !document.hidden;
    while (nextNote < horizon) {
      playSound(state.sound, foot, nextNote);
      // La file ne sert qu'au retour visuel, drainé par draw() (rAF). En arrière-plan / écran
      // verrouillé — l'usage principal — rAF est gelé : n'empiler que si la page est visible,
      // sinon la file croît sans borne sur une session de 30–90 min (NFR-10).
      if (visible) queue.push({ foot: foot, time: nextNote });
      nextNote += step;   // instant suivant calculé sur l'horloge audio → zéro dérive
      foot ^= 1;
    }
  }

  function startRun() {
    ensureAudio();
    state.running = true;
    app.classList.add('running');
    updateTransport();
    queue = []; foot = 0; lastSec = -1;
    nextNote = audioCtx.currentTime + 0.08;   // premier battement quasi immédiat (FR-8)
    startTime = audioCtx.currentTime;
    if (worker) worker.postMessage({ type: 'start', interval: TICK_MS });
    else schedTimer = setInterval(scheduler, TICK_MS);   // fallback sans worker
    rafId = requestAnimationFrame(draw);
    requestWakeLock();
  }

  function stopRun() {
    if (worker) worker.postMessage({ type: 'stop' });
    if (schedTimer) { clearInterval(schedTimer); schedTimer = null; }
    cancelAnimationFrame(rafId);
    if (state.running) { state.running = false; app.classList.remove('running'); updateTransport(); }
    el.chrono.textContent = '00:00';
    releaseWakeLock();
  }

  function draw() {
    if (!state.running) return;
    var now = audioCtx.currentTime;
    while (queue.length && queue[0].time <= now) { pulse(queue.shift().foot); }
    var sec = Math.floor(now - startTime);
    if (sec !== lastSec) { lastSec = sec; el.chrono.textContent = fmt(sec); }
    rafId = requestAnimationFrame(draw);
  }

  // ---------- Retour visuel des appuis (FR-15, reduced-motion NFR-14) ----------
  var pulseMs = 0;   // durée de base de la pulsation, recalculée seulement quand la cadence change
  function pulse(f) {
    var pad = f === 1 ? el.padR : el.padL;
    var lit = f === 1 ? el.padRLit : el.padLLit;
    if (!lit || !lit.animate) return;
    if (reduceMotion) {
      lit.animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 0.12 }],
        { duration: Math.max(140, pulseMs * 1.6), easing: 'ease-out' });
    } else {
      lit.animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }],
        { duration: pulseMs * 2, easing: 'cubic-bezier(.15,.85,.3,1)' });
      pad.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.05)' }, { transform: 'scale(1)' }],
        { duration: pulseMs * 2, easing: 'cubic-bezier(.15,.85,.3,1)' });
    }
  }
  function computePulseMs() { pulseMs = Math.min((60 / state.cadence) * 0.55, 0.18) * 1000; }

  // ---------- Réglage de la cadence ----------
  function setCadence(v) {
    var c = clamp(v);
    state.cadence = c;
    computePulseMs();
    el.cadence.textContent = c;
    updateChips();
    updateTapSub();
    savePrefsSoon();
  }
  function adjust(dir) { setCadence(state.cadence + dir); }

  // Appui maintenu : répétition accélérée après ~0,33 s (FR-3).
  var holdT = null, holdDelay = 330;
  function startHold(dir) {
    adjust(dir);
    holdDelay = 330;
    var tick = function () {
      adjust(dir);
      holdDelay = Math.max(45, holdDelay * 0.8);
      holdT = setTimeout(tick, holdDelay);
    };
    holdT = setTimeout(tick, 330);
  }
  function holdUp() { if (holdT) { clearTimeout(holdT); holdT = null; } }

  // ---------- Tap-tempo (FR-5) ----------
  var taps = [], lastTap = 0, tapResetT = null;
  function tap() {
    var now = performance.now();
    if (now - lastTap > 1800) taps = [];
    taps.push(now); lastTap = now;
    if (taps.length > 6) taps.shift();
    if (taps.length >= 2) {
      var sum = 0;
      for (var i = 1; i < taps.length; i++) sum += taps[i] - taps[i - 1];
      var avg = sum / (taps.length - 1);
      var bpm = Math.round(60000 / avg);
      if (bpm >= CAD_MIN && bpm <= CAD_MAX) setCadence(bpm);
    }
    state.tapCount = taps.length;
    updateTapSub();
    var tapEl = $('tap');
    if (tapEl && tapEl.animate && !reduceMotion) {
      tapEl.animate([{ transform: 'scale(.97)' }, { transform: 'scale(1)' }], { duration: 150, easing: 'ease-out' });
    }
    clearTimeout(tapResetT);
    tapResetT = setTimeout(function () { state.tapCount = 0; updateTapSub(); }, 1800);
  }

  // ---------- Rendu des zones dynamiques ----------
  var chipCache = [];   // [{ node, cad }] — les 4 puces sont statiques, résolues une fois
  function updateChips() {
    for (var i = 0; i < chipCache.length; i++) {
      var sel = chipCache[i].cad === state.cadence;
      chipCache[i].node.classList.toggle('selected', sel);
      chipCache[i].node.setAttribute('aria-pressed', sel ? 'true' : 'false');
    }
  }
  function updateTapSub() {
    var tc = state.tapCount;
    el.tapSub.textContent = tc > 0
      ? tc + ' tap' + (tc > 1 ? 's' : '') + ' · ' + state.cadence
      : 'Tapez le rythme';
  }
  function updateSoundLabel() {
    var s = SOUNDS.find(function (x) { return x.id === state.sound; });
    var label = s ? s.label : 'Bloc';
    el.soundValue.textContent = label;
    el.soundBtn.setAttribute('aria-label', 'Réglages du son — son actuel : ' + label);
  }
  function updateTransport() {
    el.start.classList.toggle('is-running', state.running);
    el.start.classList.toggle('is-idle', !state.running);
    el.startIcon.textContent = state.running ? '■' : '▶';
    el.startLabel.textContent = state.running ? 'ARRÊTER' : 'DÉMARRER';
    el.statusLabel.textContent = state.running ? 'EN COURSE' : 'PRÊT';
  }

  // ---------- Feuille : sons / volume / motif ----------
  function buildSheet() {
    // Sons
    SOUNDS.forEach(function (s) {
      var btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'sound-row'; btn.setAttribute('data-sound', s.id);
      btn.setAttribute('aria-pressed', 'false');
      btn.setAttribute('aria-label', 'Son ' + s.label + ' — ' + s.desc);
      btn.innerHTML =
        '<span class="sound-row-info"><span class="sound-row-name">' + s.label +
        '</span><span class="sound-row-desc">' + s.desc + '</span></span>' +
        '<span class="sound-row-badge"></span>';
      btn.addEventListener('click', function () { selectSound(s.id); });
      el.soundList.appendChild(btn);
    });
    // Volume
    VOL.forEach(function (_, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'vol-cell'; b.textContent = String(i + 1);
      b.setAttribute('aria-pressed', 'false');
      b.setAttribute('aria-label', 'Volume ' + (i + 1) + ' sur ' + VOL.length);
      b.addEventListener('click', function () { setVol(i); });
      el.volCells.appendChild(b);
    });
    // Motif
    PATTERNS.forEach(function (p) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'pattern'; b.setAttribute('data-pattern', p.id); b.textContent = p.label;
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () { setPattern(p.id); });
      el.patterns.appendChild(b);
    });
    updateSheet();
  }
  function updateSheet() {
    el.soundList.querySelectorAll('.sound-row').forEach(function (n) {
      var sel = n.getAttribute('data-sound') === state.sound;
      n.classList.toggle('selected', sel);
      n.setAttribute('aria-pressed', sel ? 'true' : 'false');
      // Seul le son actif est badgé ; le clic sur une autre ligne la sélectionne aussi (pas un simple aperçu).
      n.querySelector('.sound-row-badge').textContent = sel ? '✓ ACTIF' : '';
    });
    el.volCells.querySelectorAll('.vol-cell').forEach(function (n, i) {
      n.classList.toggle('filled', i <= state.volIndex);
      n.setAttribute('aria-pressed', i === state.volIndex ? 'true' : 'false');
    });
    el.patterns.querySelectorAll('.pattern').forEach(function (n) {
      var sel = n.getAttribute('data-pattern') === state.pattern;
      n.classList.toggle('selected', sel);
      n.setAttribute('aria-pressed', sel ? 'true' : 'false');
    });
  }
  function selectSound(id) { state.sound = id; updateSoundLabel(); updateSheet(); savePrefs(); preview(id); }
  function setVol(i) {
    state.volIndex = i; updateSheet(); savePrefs();
    if (master && audioCtx) master.gain.setTargetAtTime(VOL[i], audioCtx.currentTime, 0.02);
  }
  function setPattern(p) { state.pattern = p; updateSheet(); savePrefs(); }
  function openSheet() { ensureAudio(); app.classList.add('sheet-open'); }
  function closeSheet() { app.classList.remove('sheet-open'); }

  // ---------- Transport ----------
  function toggleRun() { ensureAudio(); state.running ? stopRun() : startRun(); }

  // ---------- Wake Lock (NFR-8, optionnel) ----------
  var wakeLock = null;
  function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    navigator.wakeLock.request('screen').then(function (w) { wakeLock = w; }).catch(function () {});
  }
  function releaseWakeLock() {
    if (wakeLock) { wakeLock.release().catch(function () {}); wakeLock = null; }
  }

  // ---------- Wiring ----------
  function bind() {
    chipCache.forEach(function (c) {
      c.node.addEventListener('click', function () { setCadence(c.cad); });
    });

    var dec = $('dec'), inc = $('inc');
    function holdBind(node, dir) {
      node.addEventListener('pointerdown', function (e) { e.preventDefault(); startHold(dir); });
      node.addEventListener('pointerup', holdUp);
      node.addEventListener('pointerleave', holdUp);
      node.addEventListener('pointercancel', holdUp);
    }
    holdBind(dec, -1); holdBind(inc, 1);

    $('tap').addEventListener('click', tap);
    $('sound-btn').addEventListener('click', openSheet);
    $('sheet-ok').addEventListener('click', closeSheet);
    $('scrim').addEventListener('click', closeSheet);
    el.start.addEventListener('click', toggleRun);

    // Barre d'espace : start/stop desktop (FR-9)
    document.addEventListener('keydown', function (e) {
      if (e.code !== 'Space') return;
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault(); toggleRun();
    });

    // Reprise propre de l'audio + wake lock au retour au premier plan (NFR-6)
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        if (state.running) requestWakeLock();
      }
    });
  }

  // ---------- Init ----------
  function init() {
    var rm = window.matchMedia('(prefers-reduced-motion: reduce)');
    reduceMotion = rm.matches;
    rm.addEventListener('change', function (e) { reduceMotion = e.matches; });

    loadPrefs();
    computePulseMs();

    // Nœuds statiques résolus une fois (évite un querySelector par battement / par changement de cadence)
    el.padLLit = el.padL.querySelector('.pad-lit');
    el.padRLit = el.padR.querySelector('.pad-lit');
    el.chips.querySelectorAll('.chip').forEach(function (n) {
      chipCache.push({ node: n, cad: parseInt(n.getAttribute('data-cad'), 10) });
    });

    try { worker = new Worker('./scheduler.worker.js'); worker.onmessage = scheduler; }
    catch (e) { worker = null; }   // fallback setInterval si Worker indisponible

    el.cadence.textContent = state.cadence;
    updateChips(); updateTapSub(); updateSoundLabel(); updateTransport();
    buildSheet();
    bind();

    setupPWA();
  }

  // ---------- PWA : invite d'installation + invite de mise à jour ----------
  var INSTALL_DISMISS_KEY = 'cadence-install-dismissed';
  function setupPWA() {
    var bar = $('app-bar');
    if (!bar) return;
    var barText = $('app-bar-text'), barAction = $('app-bar-action'), barClose = $('app-bar-close');
    var mode = null;                 // 'install' | 'update'
    var deferredPrompt = null, waitingWorker = null;

    function standalone() {
      return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    }
    function dismissed() {
      try { return localStorage.getItem(INSTALL_DISMISS_KEY) === '1'; } catch (e) { return false; }
    }

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

    barAction.addEventListener('click', function () {
      if (mode === 'update' && waitingWorker) {
        barAction.disabled = true; barText.textContent = 'Mise à jour…';
        waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      } else if (mode === 'install' && deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.catch(function () {}).then(function () {
          deferredPrompt = null; bar.hidden = true; mode = null;
        });
      }
    });
    barClose.addEventListener('click', function () {
      bar.hidden = true;
      if (mode === 'install') { try { localStorage.setItem(INSTALL_DISMISS_KEY, '1'); } catch (e) {} }
      mode = null;
    });

    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault(); deferredPrompt = e; offerInstall();
    });
    window.addEventListener('appinstalled', function () {
      deferredPrompt = null; if (mode === 'install') { bar.hidden = true; mode = null; }
    });

    // iOS Safari n'émet jamais beforeinstallprompt → invite manuelle.
    // iPadOS se présente comme un Mac : détecté via l'écran tactile.
    var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var isSafari = /^((?!chrome|crios|fxios|android).)*safari/i.test(navigator.userAgent);
    if (isIOS && isSafari) setTimeout(function () { offerInstall('ios'); }, 2500);

    if ('serviceWorker' in navigator) {
      var refreshing = false;
      var hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (!hadController) { hadController = true; return; }   // 1er install : pas de reload
        if (refreshing) return; refreshing = true; window.location.reload();
      });
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('./sw.js').then(function (reg) {
          if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
          reg.addEventListener('updatefound', function () {
            var nw = reg.installing;
            if (!nw) return;
            nw.addEventListener('statechange', function () {
              if (nw.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(nw);
            });
          });
          // Recherche une nouvelle version au retour au premier plan, au plus une fois / 30 min.
          var lastUpdate = 0;
          document.addEventListener('visibilitychange', function () {
            if (document.visibilityState !== 'visible') return;
            var now = Date.now();
            if (now - lastUpdate < 1800000) return;
            lastUpdate = now; reg.update();
          });
        }).catch(function () {});
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
