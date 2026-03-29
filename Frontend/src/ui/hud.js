/**
 * SOLARIS — HUD Elements
 * Clock, signal bars, frequency monitor, decorative UI
 */

// ═══ MISSION CLOCK ═══
export function initClock() {
  updateClock();
  setInterval(updateClock, 100);
}

function updateClock() {
  const el = document.getElementById('mission-clock');
  if (!el) return;

  const now = new Date();
  const h = String(now.getUTCHours()).padStart(2, '0');
  const m = String(now.getUTCMinutes()).padStart(2, '0');
  const s = String(now.getUTCSeconds()).padStart(2, '0');
  const ms = String(Math.floor(now.getUTCMilliseconds() / 10)).padStart(2, '0');

  el.textContent = `${h}:${m}:${s}:${ms}`;
}

// ═══ SIGNAL BARS ═══
export function initSignalBars() {
  const leftContainer = document.getElementById('signal-bars-left');
  const rightContainer = document.getElementById('signal-bars-right');

  if (leftContainer) createBars(leftContainer, 12);
  if (rightContainer) createBars(rightContainer, 12);

  // Animate bars
  setInterval(() => {
    animateBars(leftContainer);
    animateBars(rightContainer);
  }, 150);
}

function createBars(container, count) {
  container.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const bar = document.createElement('div');
    bar.className = 'signal-bar';
    bar.style.height = (5 + Math.random() * 25) + 'px';
    container.appendChild(bar);
  }
}

function animateBars(container) {
  if (!container) return;
  const bars = container.children;
  for (let i = 0; i < bars.length; i++) {
    const target = 3 + Math.random() * 27;
    bars[i].style.height = target + 'px';

    // Random color variation
    const r = Math.random();
    if (r > 0.9) bars[i].style.background = '#ff2255';
    else if (r > 0.8) bars[i].style.background = '#00ff88';
    else bars[i].style.background = '#00d4ff';
  }
}

// ═══ FREQUENCY MONITOR ═══
export function initFreqMonitor() {
  const container = document.getElementById('freq-monitor');
  if (!container) return;

  // Create 64 bars
  for (let i = 0; i < 64; i++) {
    const bar = document.createElement('div');
    bar.className = 'freq-bar';
    bar.style.height = '2px';
    container.appendChild(bar);
  }

  // Animate
  setInterval(() => {
    const bars = container.children;
    for (let i = 0; i < bars.length; i++) {
      // Create a wave pattern with noise
      const wave = Math.sin(Date.now() * 0.002 + i * 0.2) * 0.5 + 0.5;
      const noise = Math.random() * 0.3;
      const height = (wave + noise) * 36;
      bars[i].style.height = Math.max(2, height) + 'px';

      // Color gradient
      const hue = 180 + (i / 64) * 40; // cyan to green
      bars[i].style.background = `hsla(${hue}, 100%, 60%, 0.7)`;
    }
  }, 80);
}
