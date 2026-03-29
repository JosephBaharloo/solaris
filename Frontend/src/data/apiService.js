/**
 * SOLARIS — API Service
 * Fetches processed data from backend and adapts it to
 * the legacy frontend stream shapes used by panels.
 */

const CACHE = new Map();
const LISTENERS = new Map();
const BACKEND_URL = 'http://localhost:8000';

// Default location (Istanbul)
let currentLocation = { type: 'city', value: 'istanbul' };

const ENDPOINTS = {
  spaceWeather: { url: '/space-weather', interval: 60000 },
};

const LEGACY_KEYS = ['kpIndex', 'solarWind', 'xrayFlux', 'protonFlux', 'noaaScales'];

function makeIsoDate(msAgo = 0) {
  return new Date(Date.now() - msAgo).toISOString();
}

function num(val, fallback = 0) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function buildLegacyPayload(spaceWeather) {
  if (!spaceWeather || !spaceWeather.telemetry) {
    return {
      kpIndex: [],
      solarWind: [['time_tag', 'density', 'speed', 'temperature']],
      xrayFlux: [],
      protonFlux: [],
      noaaScales: { 0: { G: { Scale: '0' }, R: { Scale: '0' }, S: { Scale: '0' } } },
    };
  }

  const ts = spaceWeather.timestamp || makeIsoDate();
  const telemetry = spaceWeather.telemetry;

  const kp = num(telemetry.kp?.value);
  const speed = num(telemetry.speed?.value);
  const density = num(telemetry.density?.value);
  const xray = num(telemetry.xray?.value);
  const proton = num(telemetry.proton?.value);

  const kpIndex = [
    { time_tag: makeIsoDate(120000), kp_index: Math.max(0, kp - 0.3), estimated_kp: Math.max(0, kp - 0.3) },
    { time_tag: makeIsoDate(60000), kp_index: Math.max(0, kp - 0.1), estimated_kp: Math.max(0, kp - 0.1) },
    { time_tag: ts, kp_index: kp, estimated_kp: kp },
  ];

  const solarWind = [
    ['time_tag', 'density', 'speed', 'temperature'],
    [makeIsoDate(120000), Math.max(0, density * 0.92), Math.max(0, speed * 0.95), 120000],
    [makeIsoDate(60000), Math.max(0, density * 0.97), Math.max(0, speed * 0.98), 125000],
    [ts, density, speed, 130000],
  ];

  const xrayFlux = [
    { time_tag: makeIsoDate(120000), flux: Math.max(0, xray * 0.9), energy: '0.1-0.8nm' },
    { time_tag: makeIsoDate(60000), flux: Math.max(0, xray * 0.96), energy: '0.1-0.8nm' },
    { time_tag: ts, flux: xray, energy: '0.1-0.8nm' },
  ];

  const protonFlux = [
    { time_tag: makeIsoDate(120000), flux: Math.max(0, proton * 0.9), energy: '>=10 MeV' },
    { time_tag: makeIsoDate(60000), flux: Math.max(0, proton * 0.97), energy: '>=10 MeV' },
    { time_tag: ts, flux: proton, energy: '>=10 MeV' },
  ];

  const gScale = Math.max(0, Math.min(5, Math.round(kp - 4)));
  const rScale = telemetry.xray?.level === 'CRITICAL' ? 3 : telemetry.xray?.level === 'WARNING' ? 1 : 0;
  const sScale = telemetry.proton?.level === 'CRITICAL' ? 2 : telemetry.proton?.level === 'WARNING' ? 1 : 0;

  const noaaScales = {
    0: {
      G: { Scale: String(gScale), Text: telemetry.kp?.description || '' },
      R: { Scale: String(rScale), Text: telemetry.xray?.description || '' },
      S: { Scale: String(sScale), Text: telemetry.proton?.description || '' },
    },
  };

  return { kpIndex, solarWind, xrayFlux, protonFlux, noaaScales };
}

async function fetchData(key) {
  const endpoint = ENDPOINTS[key];
  if (!endpoint) throw new Error(`Unknown endpoint: ${key}`);

  try {
    // Build query string based on location type
    let queryString = '';
    if (currentLocation.type === 'city') {
      queryString = `?city=${encodeURIComponent(currentLocation.value)}`;
    } else if (currentLocation.type === 'coords') {
      const { lat, lon } = currentLocation.value;
      queryString = `?lat=${lat}&lon=${lon}`;
    }

    const url = `${BACKEND_URL}${endpoint.url}${queryString}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const adapted = buildLegacyPayload(data);

    CACHE.set(key, { data: adapted, timestamp: Date.now(), error: null });

    // Notify the backend stream itself and legacy streams consumed by UI modules.
    notifyListeners('spaceWeather', data);
    for (const legacyKey of LEGACY_KEYS) {
      notifyListeners(legacyKey, adapted[legacyKey]);
    }

    return adapted;
  } catch (err) {
    console.warn(`[API] Failed to fetch ${key}:`, err.message);
    const cached = CACHE.get(key);
    if (cached) {
      cached.error = err.message;
      return cached.data;
    }
    return null;
  }
}

function notifyListeners(key, data) {
  const list = LISTENERS.get(key);
  if (list) list.forEach(fn => fn(data));
}

export function onData(key, callback) {
  if (!LISTENERS.has(key)) LISTENERS.set(key, []);
  LISTENERS.get(key).push(callback);
  // Send cached data immediately if available
  const cached = CACHE.get(key);
  if (cached) callback(cached.data);
}

export function getCached(key) {
  const cached = CACHE.get(key);
  return cached ? cached.data : null;
}

const timers = new Map();

export function setLocation(type, value) {
  // type: 'city' or 'coords'
  // value: city name or { lat, lon }
  currentLocation = { type, value };
  // Immediately fetch new data for this location
  return fetchData('spaceWeather');
}

export async function startPolling() {
  // Initial fetch for default location
  await fetchData('spaceWeather');

  // Set up recurring fetches
  const interval = ENDPOINTS.spaceWeather.interval;
  const t = setInterval(() => fetchData('spaceWeather'), interval);
  timers.set('spaceWeather', t);

  console.log('[API] Polling started - Backend connected');
}

let manualOverrideActive = false;

export function injectManualData(values) {
  if (values === null) {
    // Reset to live data
    manualOverrideActive = false;
    fetchData('spaceWeather');
    return;
  }

  manualOverrideActive = true;

  const ts = new Date().toISOString();

  // Build a synthetic spaceWeather response
  const syntheticData = {
    timestamp: ts,
    location: { lat: 39.0, lon: 35.0, is_daytime: true },
    overall_status: values.kp >= 7 ? 'CRITICAL' : values.kp >= 5 ? 'WARNING' : 'NOMINAL',
    synergy_alerts: [],
    telemetry: {
      kp:      { level: values.kp >= 7 ? 'CRITICAL' : values.kp >= 5 ? 'WARNING' : 'NOMINAL', value: values.kp },
      speed:   { level: values.speed >= 700 ? 'CRITICAL' : values.speed >= 500 ? 'WARNING' : 'NOMINAL', value: values.speed },
      density: { level: values.density >= 30 ? 'CRITICAL' : values.density >= 10 ? 'WARNING' : 'NOMINAL', value: values.density },
      xray:    { level: values.xray >= 1e-4 ? 'CRITICAL' : values.xray >= 1e-5 ? 'WARNING' : 'NOMINAL', value: values.xray },
      proton:  { level: values.proton >= 100 ? 'CRITICAL' : values.proton >= 10 ? 'WARNING' : 'NOMINAL', value: values.proton },
      aurora:  { level: 'NOMINAL', value: 0 },
    },
  };

  // Build legacy payload from synthetic data
  const adapted = buildLegacyPayload(syntheticData);

  // Notify all listeners
  notifyListeners('spaceWeather', syntheticData);
  for (const legacyKey of LEGACY_KEYS) {
    notifyListeners(legacyKey, adapted[legacyKey]);
  }
}

export function isManualOverrideActive() {
  return manualOverrideActive;
}

export function stopPolling() {
  for (const [key, t] of timers) {
    clearInterval(t);
  }
  timers.clear();
}
