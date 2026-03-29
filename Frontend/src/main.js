/**
 * ╔═══════════════════════════════════════════════════════════╗
 * ║  SOLARIS — Solar Storm Detection & Alert System          ║
 * ║  Main Application Bootstrap  (Heliocentric Scene)        ║
 * ╚═══════════════════════════════════════════════════════════╝
 */
import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Globe modules
import { createEarth } from './globe/earth.js';
import { createAtmosphere } from './globe/atmosphere.js';
import { createAurora } from './globe/aurora.js';
import { createGridLines } from './globe/gridLines.js';
import { createAffectedZones } from './globe/affectedZones.js';
import { createSatellites, startSatellitePolling } from './globe/satellites.js';
import { createFlights, startFlightPolling } from './globe/flights.js';
import { createMarkers } from './globe/markers.js';
import { createSolarStorm } from './globe/solarStorm.js';
import {
  createSun, createMoon,
  getEarthRotation, getEarthWorldPos,
  getSunDirectionForShader, getGMST,
  SCENE,
} from './globe/celestial.js';

// Data modules
import { startPolling, onData } from './data/apiService.js';
import {
  getKpInfo, getKpHistory, getSolarWindInfo, getSolarWindHistory,
  getXrayFluxInfo, getXrayHistory, getProtonInfo, getProtonHistory,
  getNoaaScales, getOverallSeverity,
} from './data/stormProcessor.js';

// Panel modules
import {
  initSolarWindChart, updateSolarWindChart,
  initSolarDensityChart, updateSolarDensityChart,
  initXrayChart, updateXrayChart,
  initProtonChart, updateProtonChart,
  updateKpBars, updateAlertFeed,
  updateSystemStatus,
  updateFlightList, updateSatelliteList,
  setAlertFlightData, setAlertSatData,
} from './panels/panels.js';

// HUD modules
import { initClock } from './ui/hud.js';

// Report module
import { initReportService } from './ui/reportService.js';

// Manual Override module
import { initManualOverride } from './ui/manualOverride.js';

// ═══ THREE.JS SETUP ═══
const canvas = document.getElementById('globe-canvas');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x030508);

// ═══ CAMERA ═══
// Camera far plane must reach the Sun (at ~25 units away)
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 0.3, 2.8);
camera.lookAt(0, 0, 0);

// ═══ CONTROLS ═══
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 1.5;
controls.maxDistance = 15;
controls.enablePan = false;
controls.rotateSpeed = 0.5;
controls.autoRotate = false;

// ═══ LIGHTING ═══
// Directional light pointing from Sun → Earth (updated each frame)
const sunLight = new THREE.DirectionalLight(0xffffff, 2.0);
sunLight.position.set(5, 3, 5);
scene.add(sunLight);
scene.add(sunLight.target); // Required for directional light to track Earth

const ambientLight = new THREE.AmbientLight(0x112244, 0.5);
scene.add(ambientLight);

const hemiLight = new THREE.HemisphereLight(0x0044aa, 0x000000, 0.3);
scene.add(hemiLight);

// ═══ STAR FIELD ═══
const starGeometry = new THREE.BufferGeometry();
const starPositions = new Float32Array(3000 * 3);
for (let i = 0; i < 3000; i++) {
  const r = 40 + Math.random() * 60;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  starPositions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
  starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
  starPositions[i * 3 + 2] = r * Math.cos(phi);
}
starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
const starMaterial = new THREE.PointsMaterial({
  color: 0xffffff,
  size: 0.05,
  transparent: true,
  opacity: 0.7,
});
const stars = new THREE.Points(starGeometry, starMaterial);
scene.add(stars);

// ═══ CELESTIAL BODIES ═══
// Sun is the reference point — fixed at origin
const sun = createSun(scene);

// ═══ EARTH SYSTEM ═══
// Create a pivot group that will be positioned at Earth's orbital location.
// Everything attached to Earth (atmosphere, aurora, markers, etc.) lives here.
const earthPivot = new THREE.Group();
scene.add(earthPivot);

const earth = createEarth(earthPivot);  // adds earth.group to earthPivot
const atmosphere = createAtmosphere(earthPivot); // now parented to earthPivot
const aurora = createAurora(earthPivot);         // now parented to earthPivot
const gridLines = createGridLines(earthPivot);
const affectedZones = createAffectedZones(earthPivot);

earth.group.add(gridLines.group);
earth.group.add(affectedZones.group);

// Satellites (parented to earth.group so they rotate with Earth)
const satellites = createSatellites(earth.group, camera, renderer);

// Real-time flights (parented to earth.group so they rotate with Earth)
const flights3D = createFlights(earth.group, camera, renderer);

// City markers (parented to earth.group so they rotate with Earth)
const markers = createMarkers(earth.group, camera, renderer);

// Moon (added to scene, not earthPivot — we compute its position independently)
const moon = createMoon(scene);

// ═══ SOLAR STORM CME ANIMATION ═══
const solarStorm = createSolarStorm(scene);

// ═══ INITIAL EARTH POSITION — FOCUSED ON TURKEY ═══
const now = new Date();
const initialEarthPos = getEarthWorldPos(now, sun.worldPos);
earthPivot.position.copy(initialEarthPos);

// Compute Earth rotation so Turkey (lat 39°, lon 35°) faces the camera.
// The camera starts behind the Earth on the +Z side (relative to Earth),
// so we need Turkey's longitude to map to the +Z direction of the model.
// In the unrotated model, lon 0° (prime meridian) points along +X.
// We rotate so Turkey's longitude aligns with the camera view direction.
const TURKEY_LAT = 39.0;
const TURKEY_LON = 35.0;

// GMST rotation (astronomical) + offset so Turkey faces camera
const gmst = getGMST(now);
const turkeyLonInModelSpace = -gmst * (Math.PI / 180); // base astronomical rotation
// Camera is along +Z from Earth, so we want Turkey at lon angle = 0 in view space
// In the model, lon 0 is +X, and camera is +Z. So offset by -90° then add Turkey's lon.
const turkeyOffset = -(TURKEY_LON + 90) * (Math.PI / 180);
earth.group.rotation.y = turkeyLonInModelSpace + turkeyOffset;

// Position camera to look at Earth from a turkeye-visible angle
// Slightly above equator to see Turkey well
const camDist = 2.8;
const camAngleLat = 15 * (Math.PI / 180); // slightly above equator
camera.position.set(
  initialEarthPos.x,
  initialEarthPos.y + Math.sin(camAngleLat) * camDist,
  initialEarthPos.z + Math.cos(camAngleLat) * camDist,
);
controls.target.copy(initialEarthPos);
controls.update();

// ═══ STATE ═══
let currentKp = 0;
let currentXrayFlux = 0;
let kpInfo = { value: 0, text: 'LOADING', color: '#666', gScale: 0 };
let scalesInfo = { R: 0, S: 0, G: 0 };
let xrayInfo = { flux: 0, class: 'A', color: '#00ff88' };
let protonInfo = { flux: 0, level: 'S0', color: '#00ff88' };
let latestFlightData = null;
let latestSatData = null;

// ═══ INIT UI ═══
initClock();
initSolarWindChart();
initSolarDensityChart();
initXrayChart();
initProtonChart();

// Initialize report service
initReportService();

// Initialize manual override
initManualOverride();

// ═══ LAYER FILTERS ═══
document.getElementById('filter-satellites')?.addEventListener('change', (e) => {
  satellites.setVisible(e.target.checked);
});
document.getElementById('filter-flights')?.addEventListener('change', (e) => {
  flights3D.setVisible(e.target.checked);
});
document.getElementById('filter-markers')?.addEventListener('change', (e) => {
  markers.markerGroup.visible = e.target.checked;
});
document.getElementById('filter-grid')?.addEventListener('change', (e) => {
  gridLines.group.visible = e.target.checked;
});

// ═══ DATA HANDLERS ═══

// 1. Kp Index
onData('kpIndex', (data) => {
  kpInfo = getKpInfo(data);
  currentKp = kpInfo.value;

  const kpEl = document.getElementById('kp-value');
  const kpLabel = document.getElementById('kp-label');
  if (kpEl) {
    kpEl.textContent = kpInfo.value.toFixed(1);
    kpEl.style.color = kpInfo.color;
  }
  if (kpLabel) {
    kpLabel.textContent = kpInfo.text;
    kpLabel.style.color = kpInfo.color;
  }

  const history = getKpHistory(data, 30);
  updateKpBars(history);

  aurora.setKpLevel(kpInfo.value);
  markers.setMarkerStatus(kpInfo.value);
  atmosphere.setStormLevel(kpInfo.gScale / 5);

  // Update solar storm CME animation intensity
  solarStorm.setStormIntensity(kpInfo.value);
});

// 2 & 3. Solar Wind Speed (km/s) + Density (p/cm³)
onData('solarWind', (data) => {
  const swInfo = getSolarWindInfo(data);
  const history = getSolarWindHistory(data, 60);

  document.getElementById('sw-speed').textContent = swInfo.speed ? Math.round(swInfo.speed) : '--';
  document.getElementById('sw-density').textContent = swInfo.density ? swInfo.density.toFixed(1) : '--';

  updateSolarWindChart(history);
  updateSolarDensityChart(history);
});

// 4. X-Ray Flux (W/m²)
onData('xrayFlux', (data) => {
  xrayInfo = getXrayFluxInfo(data);
  currentXrayFlux = xrayInfo.flux;

  const xrayVal = document.getElementById('xray-value');
  const xrayBadge = document.getElementById('xray-class-badge');
  if (xrayVal) {
    xrayVal.textContent = xrayInfo.flux ? xrayInfo.flux.toExponential(2) : '--';
    xrayVal.style.color = xrayInfo.color;
  }
  if (xrayBadge) {
    xrayBadge.textContent = `CLASS ${xrayInfo.class}`;
    xrayBadge.style.color = xrayInfo.color;
    xrayBadge.style.borderColor = xrayInfo.color;
    xrayBadge.style.background = xrayInfo.color + '15';
  }

  const history = getXrayHistory(data, 80);
  updateXrayChart(history);
});

// 5. Proton Flux (pfu)
onData('protonFlux', (data) => {
  protonInfo = getProtonInfo(data);

  const protonVal = document.getElementById('proton-value');
  const protonBadge = document.getElementById('proton-level-badge');
  if (protonVal) {
    protonVal.textContent = protonInfo.flux ? protonInfo.flux.toFixed(2) : '--';
    protonVal.style.color = protonInfo.color;
  }
  if (protonBadge) {
    protonBadge.textContent = protonInfo.level;
    protonBadge.style.color = protonInfo.color;
    protonBadge.style.borderColor = protonInfo.color;
    protonBadge.style.background = protonInfo.color + '15';
  }

  const history = getProtonHistory(data, 60);
  updateProtonChart(history);
});

// System status
onData('noaaScales', (data) => {
  scalesInfo = getNoaaScales(data);
  const severity = getOverallSeverity(kpInfo, scalesInfo);
  updateSystemStatus(severity);
});

// ═══ ANIMATION LOOP ═══
const clock = new THREE.Clock();
let lastDataUpdate = 0;

function animate() {
  requestAnimationFrame(animate);

  const dt = clock.getDelta();
  const elapsed = clock.getElapsedTime();
  const currentTime = new Date();

  // ─── Compute heliocentric positions ───
  const earthPos = getEarthWorldPos(currentTime, sun.worldPos);
  earthPivot.position.copy(earthPos);

  // Camera follows Earth (controls.target tracks Earth's position)
  controls.target.copy(earthPos);
  controls.update();

  // ─── Earth self-rotation (UTC-based) ───
  earth.group.rotation.y = getEarthRotation(currentTime);

  // ─── Update Sun ───
  sun.update(currentTime);

  // Sun direction for the day/night shader (astronomically correct)
  const sunDir = getSunDirectionForShader(currentTime);
  earth.setSunDirection(sunDir);

  // Update directional light to come from sun direction (relative to Earth)
  sunLight.position.copy(sunDir.clone().multiplyScalar(5).add(earthPos));
  sunLight.target.position.copy(earthPos);

  // ─── Moon ───
  moon.update(currentTime, earthPos);

  // ─── Globe overlays ───
  earth.update(dt);
  atmosphere.update(dt, elapsed);
  aurora.update(dt, elapsed);
  affectedZones.update(dt, elapsed, currentKp, currentXrayFlux);

  // ─── Solar Storm CME ───
  solarStorm.update(dt, elapsed, earthPos, sun.worldPos);

  // ─── Satellites ───
  satellites.update(dt, elapsed);
  satellites.updateLabels();

  // ─── Flights ───
  flights3D.update(dt, elapsed);
  flights3D.updateLabels();

  // ─── City Markers ───
  markers.update(dt, elapsed);
  markers.updateLabels();

  // ─── Periodic data updates ───
  if (elapsed - lastDataUpdate > 5) {
    lastDataUpdate = elapsed;
    updateAlertFeed(kpInfo, scalesInfo, xrayInfo);
  }

  renderer.render(scene, camera);
}

// ═══ RESIZE HANDLER ═══
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ═══ START ═══
console.log('%c[SOLARIS] System initializing...', 'color: #00d4ff; font-weight: bold;');

startPolling().then(() => {
  console.log('%c[SOLARIS] Data streams active', 'color: #00ff88; font-weight: bold;');
});

// Start satellite position polling
startSatellitePolling((data) => {
  satellites.updateFromData(data);
  latestSatData = data;
  updateSatelliteList(data);
  setAlertSatData(data);
  console.log(`%c[SAT] Tracking ${data.count} Turkish satellites`, 'color: #ffaa00;');
});

// Start real-time flight polling
startFlightPolling((data) => {
  flights3D.updateFromData(data);
  latestFlightData = data;
  updateFlightList(data);
  setAlertFlightData(data);
  console.log(`%c[FLIGHT] ✈ ${data.count} Turkish airlines tracked (${data.total_over_turkey} total)`, 'color: #cc0000;');
});

animate();
console.log('%c[SOLARIS] System online', 'color: #00d4ff; font-weight: bold; font-size: 14px;');
