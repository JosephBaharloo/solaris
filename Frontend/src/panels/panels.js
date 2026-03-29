/**
 * SOLARIS — Panel Renderers
 * Dashboard panels for the 5 core parameters:
 * 1. Kp Index  2. Solar Wind Speed (km/s)  3. Solar Wind Density (p/cm³)
 * 4. X-Ray Flux (W/m²)  5. Proton Flux (pfu)
 */
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

// ═══ HISTORY BUFFERS ═══
// Accumulate data over time for real trend lines (not just 3 synthetic points)
const MAX_HISTORY = 120; // ~2 hours at 60s polling

const historyBuffers = {
  speed: [],
  density: [],
  xray: [],
  proton: [],
};

function pushToBuffer(key, value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return;
  historyBuffers[key].push(value);
  if (historyBuffers[key].length > MAX_HISTORY) {
    historyBuffers[key].shift();
  }
}

// ═══ CHART DEFAULTS ═══
const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 300 },
  plugins: {
    legend: { display: false },
    tooltip: { enabled: false },
  },
  scales: {
    x: {
      display: false,
      grid: { display: false },
    },
    y: {
      display: true,
      grid: {
        color: 'rgba(0,212,255,0.06)',
        lineWidth: 0.5,
      },
      ticks: {
        font: { family: 'Share Tech Mono', size: 8 },
        color: 'rgba(160,185,210,0.4)',
        maxTicksLimit: 4,
      },
      border: { display: false },
    },
  },
};

/**
 * Compute dynamic min/max with padding for a linear chart.
 * Ensures the data fills ~70-80% of the chart height.
 */
function dynamicRange(data, paddingFactor = 0.15) {
  if (!data.length) return { min: 0, max: 1 };
  let min = Math.min(...data);
  let max = Math.max(...data);

  // If all values are the same, create a range around that value
  if (max === min) {
    const v = max || 1;
    return { min: Math.max(0, v * 0.8), max: v * 1.2 };
  }

  const range = max - min;
  const pad = range * paddingFactor;
  return {
    min: Math.max(0, Math.floor((min - pad) / 10) * 10),  // Round down to nearest 10
    max: Math.ceil((max + pad) / 10) * 10,                // Round up to nearest 10
  };
}


// ═══ SOLAR WIND SPEED CHART (km/s) ═══
let swChart = null;

export function initSolarWindChart() {
  const ctx = document.getElementById('canvas-solar-wind');
  if (!ctx) return;

  swChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Speed (km/s)',
        data: [],
        borderColor: '#00d4ff',
        borderWidth: 1.5,
        fill: true,
        backgroundColor: 'rgba(0,212,255,0.05)',
        pointRadius: 0,
        tension: 0.3,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        ...CHART_DEFAULTS.scales,
        y: {
          ...CHART_DEFAULTS.scales.y,
          // Dynamic — set in update
        },
      },
    },
  });
}

export function updateSolarWindChart(history) {
  if (!swChart || !history.length) return;

  // Seed all history points into the buffer
  history.forEach(h => pushToBuffer('speed', h.speed));

  const buf = historyBuffers.speed;
  if (buf.length < 2) return;

  const { min, max } = dynamicRange(buf);
  swChart.data.labels = buf.map((_, i) => i);
  swChart.data.datasets[0].data = [...buf];
  swChart.options.scales.y.min = min;
  swChart.options.scales.y.max = max;
  swChart.update('none');
}

// ═══ SOLAR WIND DENSITY CHART (p/cm³) ═══
let densityChart = null;

export function initSolarDensityChart() {
  const ctx = document.getElementById('canvas-solar-density');
  if (!ctx) return;

  densityChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Density (p/cm³)',
        data: [],
        borderColor: '#00ff88',
        borderWidth: 1.5,
        fill: true,
        backgroundColor: 'rgba(0,255,136,0.06)',
        pointRadius: 0,
        tension: 0.3,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        ...CHART_DEFAULTS.scales,
        y: {
          ...CHART_DEFAULTS.scales.y,
          // Dynamic — set in update
        },
      },
    },
  });
}

export function updateSolarDensityChart(history) {
  if (!densityChart || !history.length) return;

  // Seed all history points into the buffer
  history.forEach(h => pushToBuffer('density', h.density));

  const buf = historyBuffers.density;
  if (buf.length < 2) return;

  // Density uses smaller rounding
  let min = Math.min(...buf);
  let max = Math.max(...buf);
  if (max === min) { min = Math.max(0, min * 0.8); max = (max || 1) * 1.2; }
  const pad = (max - min) * 0.15;
  const yMin = Math.max(0, Math.floor(min - pad));
  const yMax = Math.ceil(max + pad);

  densityChart.data.labels = buf.map((_, i) => i);
  densityChart.data.datasets[0].data = [...buf];
  densityChart.options.scales.y.min = yMin;
  densityChart.options.scales.y.max = yMax;
  densityChart.update('none');
}

// ═══ X-RAY FLUX CHART (W/m²) ═══
let xrayChart = null;

export function initXrayChart() {
  const ctx = document.getElementById('canvas-xray');
  if (!ctx) return;

  xrayChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'X-Ray Flux (W/m²)',
        data: [],
        borderColor: '#ffaa00',
        borderWidth: 1.5,
        fill: true,
        backgroundColor: 'rgba(255,170,0,0.08)',
        pointRadius: 0,
        tension: 0.2,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        ...CHART_DEFAULTS.scales,
        y: {
          ...CHART_DEFAULTS.scales.y,
          type: 'logarithmic',
          ticks: {
            ...CHART_DEFAULTS.scales.y.ticks,
            callback: (val) => val.toExponential(0),
          },
          // Dynamic — set in update
        },
      },
    },
  });
}

export function updateXrayChart(history) {
  if (!xrayChart || !history.length) return;

  // Seed all history points into the buffer
  history.forEach(h => pushToBuffer('xray', Math.max(1e-10, h.flux)));

  const buf = historyBuffers.xray;
  if (buf.length < 2) return;

  // Log scale: find the power-of-10 range around the data
  const minVal = Math.min(...buf);
  const maxVal = Math.max(...buf);
  const logMin = Math.floor(Math.log10(Math.max(1e-10, minVal)));
  const logMax = Math.ceil(Math.log10(Math.max(1e-10, maxVal)));

  // Show at least 2 decades
  const yMin = Math.pow(10, Math.min(logMin, logMax - 2));
  const yMax = Math.pow(10, Math.max(logMax, logMin + 2));

  xrayChart.data.labels = buf.map((_, i) => i);
  xrayChart.data.datasets[0].data = [...buf];
  xrayChart.options.scales.y.min = yMin;
  xrayChart.options.scales.y.max = yMax;
  xrayChart.update('none');
}

// ═══ PROTON FLUX CHART (pfu) ═══
let protonChart = null;

export function initProtonChart() {
  const ctx = document.getElementById('canvas-proton');
  if (!ctx) return;

  protonChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Proton Flux (pfu)',
        data: [],
        borderColor: '#ff2255',
        borderWidth: 1.5,
        fill: true,
        backgroundColor: 'rgba(255,34,85,0.08)',
        pointRadius: 0,
        tension: 0.2,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        ...CHART_DEFAULTS.scales,
        y: {
          ...CHART_DEFAULTS.scales.y,
          type: 'logarithmic',
          ticks: {
            ...CHART_DEFAULTS.scales.y.ticks,
            callback: (val) => val >= 1 ? val : val.toFixed(1),
          },
          // Dynamic — set in update
        },
      },
    },
  });
}

export function updateProtonChart(history) {
  if (!protonChart || !history.length) return;

  // Seed all history points into the buffer
  history.forEach(h => pushToBuffer('proton', Math.max(0.01, h.flux)));

  const buf = historyBuffers.proton;
  if (buf.length < 2) return;

  // Log scale: find the power-of-10 range around the data
  const minVal = Math.min(...buf);
  const maxVal = Math.max(...buf);
  const logMin = Math.floor(Math.log10(Math.max(0.001, minVal)));
  const logMax = Math.ceil(Math.log10(Math.max(0.001, maxVal)));

  const yMin = Math.pow(10, Math.min(logMin, logMax - 2));
  const yMax = Math.pow(10, Math.max(logMax, logMin + 2));

  protonChart.data.labels = buf.map((_, i) => i);
  protonChart.data.datasets[0].data = [...buf];
  protonChart.options.scales.y.min = yMin;
  protonChart.options.scales.y.max = yMax;
  protonChart.update('none');
}

// ═══ KP BARS ═══
export function updateKpBars(history) {
  const container = document.getElementById('kp-bars');
  if (!container) return;

  container.innerHTML = '';
  const max = 9;

  history.forEach(h => {
    const bar = document.createElement('div');
    bar.className = 'kp-bar';
    const pct = (h.value / max) * 100;
    bar.style.height = Math.max(4, pct) + '%';

    if (h.value >= 7) bar.style.background = '#ff2255';
    else if (h.value >= 5) bar.style.background = '#ffaa00';
    else if (h.value >= 4) bar.style.background = '#ffee00';
    else bar.style.background = '#00d4ff';

    container.appendChild(bar);
  });
}

// ═══ FLIGHT LIST (Real OpenSky Data) ═══
export function updateFlightList(flightData) {
  const container = document.getElementById('flight-list');
  if (!container) return;

  if (!flightData || !flightData.flights || flightData.flights.length === 0) {
    container.innerHTML = '<div class="flight-item-empty">No Turkish airline flights detected</div>';
    return;
  }

  container.innerHTML = '';

  // Store count in header
  const header = document.querySelector('#panel-flights .panel-header .panel-title');
  if (header) header.textContent = `Flight Monitor (${flightData.flights.length})`;

  flightData.flights.forEach(f => {
    if (f.on_ground) return;
    const altFt = Math.round((f.altitude_m || 0) * 3.281);
    const speedKts = Math.round((f.velocity_ms || 0) * 1.944);
    const item = document.createElement('div');
    item.className = 'flight-item';
    item.innerHTML = `
      <div class="flight-icon">✈</div>
      <div class="flight-info">
        <div class="flight-callsign">${f.callsign}</div>
        <div class="flight-route">${f.airline} · FL${Math.round(altFt / 100)} · ${speedKts}kts · ${Math.round(f.heading || 0)}°</div>
      </div>
      <div class="flight-status-dot safe"></div>
    `;
    container.appendChild(item);
  });
}

// ═══ SATELLITE LIST ═══
export function updateSatelliteList(satData) {
  const container = document.getElementById('satellite-list');
  if (!container) return;

  if (!satData || !satData.satellites || satData.satellites.length === 0) {
    container.innerHTML = '<div class="flight-item-empty">No satellite data available</div>';
    return;
  }

  // Update header count
  const header = document.querySelector('#panel-satellites .panel-header .panel-title');
  if (header) header.textContent = `Satellite Monitor (${satData.satellites.length})`;

  container.innerHTML = '';

  satData.satellites.forEach(sat => {
    const danger = sat.danger_level || 'NOMINAL';
    const dotClass = danger === 'CRITICAL' ? 'danger' : danger === 'WARNING' ? 'elevated' : 'safe';
    const altStr = sat.altitude_km ? `${Math.round(sat.altitude_km)} km` : '--';
    const item = document.createElement('div');
    item.className = 'satellite-item';
    item.innerHTML = `
      <div class="flight-icon">🛰</div>
      <div class="flight-info">
        <div class="flight-callsign">${sat.name}</div>
        <div class="flight-route">ALT ${altStr} · LAT ${sat.lat?.toFixed(1) || '--'}° · LON ${sat.lon?.toFixed(1) || '--'}°</div>
      </div>
      <div class="flight-status-dot ${dotClass}"></div>
    `;
    container.appendChild(item);
  });
}

// ═══ ALERT FEED (with affected assets) ═══
let _lastFlightData = null;
let _lastSatData = null;

export function setAlertFlightData(flightData) {
  _lastFlightData = flightData;
}

export function setAlertSatData(satData) {
  _lastSatData = satData;
}

export function updateAlertFeed(kpInfo, scalesInfo, xrayInfo) {
  const container = document.getElementById('alert-feed');
  if (!container) return;

  const alerts = [];
  const now = new Date().toISOString().substr(11, 5);

  if (kpInfo.gScale > 0) {
    alerts.push({
      time: now,
      text: `Geomagnetic storm: ${kpInfo.text} (Kp=${kpInfo.value.toFixed(1)})`,
      level: kpInfo.gScale >= 3 ? 'critical' : 'warning',
    });
  }

  if (xrayInfo.class === 'M' || xrayInfo.class === 'X') {
    alerts.push({
      time: now,
      text: `X-Ray flare: Class ${xrayInfo.class} (${xrayInfo.flux.toExponential(1)} W/m²)`,
      level: xrayInfo.class === 'X' ? 'critical' : 'warning',
    });
  }

  if (scalesInfo.R > 0) {
    alerts.push({
      time: now,
      text: `Radio blackout: R${scalesInfo.R} — HF degradation`,
      level: scalesInfo.R >= 3 ? 'critical' : 'warning',
    });
  }

  if (scalesInfo.S > 0) {
    alerts.push({
      time: now,
      text: `Solar radiation storm: S${scalesInfo.S} — Elevated proton flux`,
      level: scalesInfo.S >= 3 ? 'critical' : 'warning',
    });
  }

  // ── Affected Satellites ──
  if (kpInfo.value >= 5 && _lastSatData && _lastSatData.satellites) {
    const affectedSats = _lastSatData.satellites.filter(
      s => s.danger_level === 'CRITICAL' || s.danger_level === 'WARNING'
    );
    if (affectedSats.length > 0) {
      const critSats = affectedSats.filter(s => s.danger_level === 'CRITICAL');
      const warnSats = affectedSats.filter(s => s.danger_level === 'WARNING');
      if (critSats.length > 0) {
        const names = critSats.map(s => s.name).join(', ');
        alerts.push({
          time: now,
          text: `🛰 CRITICAL SATELLITES: ${names} — in auroral danger zone`,
          level: 'critical',
        });
      }
      if (warnSats.length > 0) {
        const names = warnSats.map(s => s.name).join(', ');
        alerts.push({
          time: now,
          text: `🛰 AT-RISK SATELLITES: ${names} — approaching danger zone`,
          level: 'warning',
        });
      }
    }
  }

  // ── Affected Flights ──
  if (kpInfo.value >= 5 && _lastFlightData && _lastFlightData.flights) {
    const affectedLat = 90 - (kpInfo.value * 7.5);
    const dangerFlights = _lastFlightData.flights.filter(
      f => !f.on_ground && Math.abs(f.lat) > affectedLat
    );
    const warnFlights = _lastFlightData.flights.filter(
      f => !f.on_ground && Math.abs(f.lat) > (affectedLat - 10) && Math.abs(f.lat) <= affectedLat
    );
    if (dangerFlights.length > 0) {
      const callsigns = dangerFlights.map(f => f.callsign).slice(0, 5).join(', ');
      alerts.push({
        time: now,
        text: `✈ FLIGHTS IN DANGER ZONE: ${callsigns}${dangerFlights.length > 5 ? ` +${dangerFlights.length - 5} more` : ''}`,
        level: 'critical',
      });
    }
    if (warnFlights.length > 0) {
      const callsigns = warnFlights.map(f => f.callsign).slice(0, 5).join(', ');
      alerts.push({
        time: now,
        text: `✈ FLIGHTS APPROACHING ZONE: ${callsigns}${warnFlights.length > 5 ? ` +${warnFlights.length - 5} more` : ''}`,
        level: 'warning',
      });
    }
  }

  alerts.push({
    time: now,
    text: `System monitoring 5 data streams · All channels active`,
    level: 'info',
  });

  container.innerHTML = alerts.map(a => `
    <div class="alert-item ${a.level}">
      <span class="alert-time">${a.time}</span>${a.text}
    </div>
  `).join('');
}

// ═══ SYSTEM STATUS ═══
export function updateSystemStatus(severity) {
  const el = document.getElementById('system-status');
  if (!el) return;

  el.className = 'status-badge ' + (severity.level === 'nominal' ? 'nominal' :
    severity.level === 'minor' || severity.level === 'elevated' ? 'elevated' : 'severe');
  el.innerHTML = `<span class="panel-status"></span> ${severity.text}`;
}
