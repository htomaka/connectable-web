// Driver de timing (NFR-3).
// Un simple tick régulier posté au thread principal. Contrairement à setInterval
// exécuté dans la page, un Web Worker n'est pas throttlé quand l'onglet passe en
// arrière-plan / l'écran se verrouille : le scheduler audio reste alimenté et le
// battement ne se coupe pas (AC-3). Le worker ne calcule aucun instant audio ;
// il ne fait que réveiller le scheduler, qui planifie sur AudioContext.currentTime.

let timer = null;
let interval = 25; // ms

self.onmessage = (e) => {
  const msg = e.data || {};
  if (msg.type === 'start') {
    if (typeof msg.interval === 'number') interval = msg.interval;
    if (timer === null) timer = setInterval(() => self.postMessage('tick'), interval);
  } else if (msg.type === 'stop') {
    if (timer !== null) { clearInterval(timer); timer = null; }
  }
};
