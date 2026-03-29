/**
 * SOLARIS — Manual Override System
 * Allows users to inject custom space weather values
 * to simulate extreme events for demonstration purposes.
 *
 * Pushes synthetic data through the same notification pipeline
 * so all panels, 3D effects, and alerts respond correctly.
 */
import { injectManualData } from '../data/apiService.js';

// Preset storm scenarios for quick testing
const PRESETS = {
  nominal: { kp: 2, speed: 350, density: 4, xray: 1e-7, proton: 0.5 },
  moderate: { kp: 5, speed: 550, density: 15, xray: 5e-5, proton: 25 },
  severe: { kp: 7, speed: 750, density: 35, xray: 2e-4, proton: 150 },
  extreme: { kp: 9, speed: 900, density: 60, xray: 8e-4, proton: 500 },
};

export function initManualOverride() {
  const container = document.getElementById('manual-override-panel');
  if (!container) return;

  const toggleBtn = document.getElementById('manual-override-toggle');
  const form = document.getElementById('manual-override-form');
  let isOpen = false;

  // Toggle button
  toggleBtn?.addEventListener('click', () => {
    isOpen = !isOpen;
    form.classList.toggle('hidden', !isOpen);
    toggleBtn.classList.toggle('active', isOpen);
  });

  // Preset buttons
  document.querySelectorAll('.override-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = PRESETS[btn.dataset.preset];
      if (!preset) return;

      // Fill in form values
      document.getElementById('ov-kp').value = preset.kp;
      document.getElementById('ov-speed').value = preset.speed;
      document.getElementById('ov-density').value = preset.density;
      document.getElementById('ov-xray').value = preset.xray;
      document.getElementById('ov-proton').value = preset.proton;

      // Highlight active preset
      document.querySelectorAll('.override-preset-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });

  // Inject button
  document.getElementById('override-inject-btn')?.addEventListener('click', () => {
    const kp = parseFloat(document.getElementById('ov-kp').value) || 0;
    const speed = parseFloat(document.getElementById('ov-speed').value) || 0;
    const density = parseFloat(document.getElementById('ov-density').value) || 0;
    const xray = parseFloat(document.getElementById('ov-xray').value) || 0;
    const proton = parseFloat(document.getElementById('ov-proton').value) || 0;

    injectManualData({ kp, speed, density, xray, proton });

    // Flash confirmation
    const btn = document.getElementById('override-inject-btn');
    btn.textContent = '✓ INJECTED';
    btn.style.borderColor = '#00ff88';
    btn.style.color = '#00ff88';
    setTimeout(() => {
      btn.textContent = '⚡ INJECT VALUES';
      btn.style.borderColor = '';
      btn.style.color = '';
    }, 1500);
  });

  // Reset to live data
  document.getElementById('override-reset-btn')?.addEventListener('click', () => {
    injectManualData(null); // null signals return to live data
    document.querySelectorAll('.override-preset-btn').forEach(b => b.classList.remove('selected'));

    const btn = document.getElementById('override-reset-btn');
    btn.textContent = '✓ LIVE DATA RESTORED';
    setTimeout(() => {
      btn.textContent = '↻ RESET TO LIVE';
    }, 1500);
  });
}
