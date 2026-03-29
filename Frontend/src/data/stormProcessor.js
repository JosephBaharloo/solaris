/**
 * SOLARIS — Storm Processor
 * Converts raw API data into actionable storm severity metrics
 */

export function getKpInfo(kpData) {
  if (!kpData || !kpData.length) return { value: 0, text: 'NO DATA', color: '#666', gScale: 0 };

  const latest = kpData[kpData.length - 1];
  // Use estimated_kp for fractional precision, fall back to kp_index
  const val = parseFloat(latest.estimated_kp) || parseFloat(latest.kp_index) || 0;

  let text, color, gScale;
  if (val < 4) { text = 'QUIET'; color = '#00ff88'; gScale = 0; }
  else if (val < 5) { text = 'ACTIVE'; color = '#00ff88'; gScale = 0; }
  else if (val < 6) { text = 'G1 MINOR'; color = '#ffee00'; gScale = 1; }
  else if (val < 7) { text = 'G2 MODERATE'; color = '#ffaa00'; gScale = 2; }
  else if (val < 8) { text = 'G3 STRONG'; color = '#ff6622'; gScale = 3; }
  else if (val < 9) { text = 'G4 SEVERE'; color = '#ff2255'; gScale = 4; }
  else { text = 'G5 EXTREME'; color = '#ff0033'; gScale = 5; }

  return { value: val, text, color, gScale, timestamp: latest.time_tag };
}

export function getKpHistory(kpData, count = 24) {
  if (!kpData || !kpData.length) return [];
  const recent = kpData.slice(-count);
  return recent.map(d => ({
    value: parseFloat(d.kp_index) || parseFloat(d.estimated_kp) || 0,
    time: d.time_tag,
  }));
}

export function getAffectedLatitude(kpValue) {
  // Auroral oval equatorward boundary approximation
  // Higher Kp = lower latitude affected
  return Math.max(0, 90 - (kpValue * 7.5));
}

export function getSolarWindInfo(swData) {
  if (!swData || swData.length < 2) return { speed: 0, density: 0, temp: 0 };

  // NOAA plasma-2-hour.json columns: [time_tag, density, speed, temperature]
  const latest = swData[swData.length - 1];
  return {
    speed: parseFloat(latest[2]) || 0,
    density: parseFloat(latest[1]) || 0,
    temp: parseFloat(latest[3]) || 0,
    time: latest[0],
  };
}

export function getSolarWindHistory(swData, count = 60) {
  if (!swData || swData.length < 2) return [];
  const rows = swData.slice(1).slice(-count); // skip header row only
  return rows.map(r => ({
    time: r[0],
    speed: parseFloat(r[2]) || 0,    // column 2 = speed
    density: parseFloat(r[1]) || 0,  // column 1 = density
    temp: parseFloat(r[3]) || 0,
  }));
}

export function getXrayFluxInfo(xrayData) {
  if (!xrayData || !xrayData.length) return { flux: 0, class: 'A', color: '#00ff88' };

  const latest = xrayData[xrayData.length - 1];
  const flux = parseFloat(latest.flux) || 0;

  let cls, color;
  if (flux < 1e-7) { cls = 'A'; color = '#00ff88'; }
  else if (flux < 1e-6) { cls = 'B'; color = '#00ff88'; }
  else if (flux < 1e-5) { cls = 'C'; color = '#ffee00'; }
  else if (flux < 1e-4) { cls = 'M'; color = '#ffaa00'; }
  else { cls = 'X'; color = '#ff2255'; }

  return { flux, class: cls, color, energy: latest.energy, time: latest.time_tag };
}

export function getXrayHistory(xrayData, count = 80) {
  if (!xrayData || !xrayData.length) return [];
  // Filter for 0.1-0.8nm band (short wave)
  const shortWave = xrayData.filter(d => d.energy && d.energy.includes('0.1-0.8'));
  return shortWave.slice(-count).map(d => ({
    time: d.time_tag,
    flux: parseFloat(d.flux) || 0,
  }));
}

export function getProtonInfo(protonData) {
  if (!protonData || !protonData.length) return { flux: 0, level: 'S0', color: '#00ff88' };

  // Get >=10 MeV channel (primary for S-scale)
  const mev10 = protonData.filter(d => d.energy && d.energy.includes('>=10'));
  if (!mev10.length) return { flux: 0, level: 'S0', color: '#00ff88' };

  const latest = mev10[mev10.length - 1];
  const flux = parseFloat(latest.flux) || 0;

  let level, color;
  if (flux < 10) { level = 'S0'; color = '#00ff88'; }
  else if (flux < 100) { level = 'S1'; color = '#ffee00'; }
  else if (flux < 1000) { level = 'S2'; color = '#ffaa00'; }
  else if (flux < 10000) { level = 'S3'; color = '#ff6622'; }
  else if (flux < 100000) { level = 'S4'; color = '#ff2255'; }
  else { level = 'S5'; color = '#ff0033'; }

  return { flux, level, color, time: latest.time_tag };
}

export function getProtonHistory(protonData, count = 60) {
  if (!protonData || !protonData.length) return [];
  const mev10 = protonData.filter(d => d.energy && d.energy.includes('>=10'));
  return mev10.slice(-count).map(d => ({
    time: d.time_tag,
    flux: parseFloat(d.flux) || 0,
  }));
}

export function getNoaaScales(scalesData) {
  if (!scalesData) return { R: 0, S: 0, G: 0, Rtext: 'none', Stext: 'none', Gtext: 'none' };

  const current = scalesData['0'] || {};
  const r = current.R || {};
  const s = current.S || {};
  const g = current.G || {};

  return {
    R: parseInt(r.Scale) || 0,
    S: parseInt(s.Scale) || 0,
    G: parseInt(g.Scale) || 0,
    Rtext: r.Text || 'none',
    Stext: s.Text || 'none',
    Gtext: g.Text || 'none',
  };
}

export function getScaleColor(level) {
  if (level <= 0) return '#4a5568';
  if (level === 1) return '#ffee00';
  if (level === 2) return '#ffaa00';
  if (level === 3) return '#ff6622';
  if (level === 4) return '#ff2255';
  return '#ff0033';
}

export function getOverallSeverity(kpInfo, scalesInfo) {
  const max = Math.max(kpInfo.gScale || 0, scalesInfo.R || 0, scalesInfo.S || 0, scalesInfo.G || 0);
  if (max === 0) return { level: 'nominal', text: 'NOMINAL', color: '#00ff88' };
  if (max <= 1) return { level: 'minor', text: 'MINOR STORM', color: '#ffee00' };
  if (max <= 2) return { level: 'elevated', text: 'ELEVATED', color: '#ffaa00' };
  if (max <= 3) return { level: 'severe', text: 'SEVERE', color: '#ff6622' };
  return { level: 'extreme', text: 'EXTREME', color: '#ff2255' };
}

export function getEnlilInfo(enlilData) {
  if (!enlilData || !enlilData.length) return { speed: 0, density: 0, hasEvent: false };

  const latest = enlilData[enlilData.length - 1];
  return {
    speed: parseFloat(latest.speed) || 0,
    density: parseFloat(latest.density) || 0,
    time: latest.time_tag,
    hasEvent: (parseFloat(latest.speed) || 0) > 500,
  };
}
