// Driver de ticks pour le compte à rebours.
// Un Web Worker n'est pas throttlé quand l'onglet passe en arrière-plan ou que
// l'écran se verrouille — contrairement à setInterval exécuté dans la page, qui
// est bridé (souvent >=1 s, parfois 1x/min sur mobile). Le worker ne mesure rien :
// il ne fait que réveiller régulièrement le thread principal, qui recale le temps
// restant sur performance.now(). La séance reste donc juste, même écran éteint.

let timer = null;
let interval = 250; // ms

self.onmessage = (e) => {
  const msg = e.data || {};
  if (msg.type === 'start') {
    if (typeof msg.interval === 'number') interval = msg.interval;
    if (timer === null) timer = setInterval(() => self.postMessage('tick'), interval);
  } else if (msg.type === 'stop') {
    if (timer !== null) { clearInterval(timer); timer = null; }
  }
};
