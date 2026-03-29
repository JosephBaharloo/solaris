/**
 * SOLARIS — Celestial Bodies Module (Heliocentric)
 *
 * Sun is the reference point (fixed in scene).
 * Earth orbits the Sun.  Moon orbits Earth with 5° inclination.
 *
 * Scaled-down real measurements:
 *   Real ratio          Scene value
 *   Sun radius   109×Earth   →  3.5  (artistic compression)
 *   Moon radius  0.27×Earth  →  0.27
 *   Sun–Earth    23 480×     →  25   (heavily compressed)
 *   Earth–Moon   60×         →  4    (compressed for visibility)
 */
import * as THREE from 'three';

// ═══ CONSTANTS ═══
const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const J2000 = 2451545.0;

// ═══ SCENE SCALE PARAMETERS ═══
export const SCENE = {
  sunRadius:        3.5,    // Sun sphere size (real ≈109× Earth, compressed)
  earthRadius:      1.0,    // Earth = unit sphere
  moonRadius:       0.27,   // Real ratio Earth→Moon
  earthOrbitRadius: 25,     // Sun ↔ Earth distance (real ≈23 480, compressed)
  moonOrbitRadius:  4,      // Earth ↔ Moon distance (real ≈60, compressed)
  moonInclination:  5.0,    // degrees — Moon's orbital tilt to ecliptic
};

// ═══ ASTRONOMY HELPERS ═══

function dateToJulian(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

function getSunPosition(date) {
  const JD = dateToJulian(date);
  const T = (JD - J2000) / 36525;

  const L0 = (280.46646 + 36000.76983 * T + 0.0003032 * T * T) % 360;
  const M  = (357.52911 + 35999.05029 * T - 0.0001537 * T * T) % 360;
  const e  = 0.016708634 - 0.000042037 * T;

  const Mrad = M * DEG2RAD;
  const C = (1.914602 - 0.004817 * T) * Math.sin(Mrad)
    + 0.019993 * Math.sin(2 * Mrad)
    + 0.000289 * Math.sin(3 * Mrad);

  const sunLon   = (L0 + C) % 360;
  const sunAnomaly = M + C;
  const R = (1.000001018 * (1 - e * e)) / (1 + e * Math.cos(sunAnomaly * DEG2RAD));

  const obliquity = 23.439291 - 0.0130042 * T;
  const oblRad = obliquity * DEG2RAD;
  const lonRad = sunLon * DEG2RAD;

  const ra  = Math.atan2(Math.cos(oblRad) * Math.sin(lonRad), Math.cos(lonRad)) * RAD2DEG;
  const dec = Math.asin(Math.sin(oblRad) * Math.sin(lonRad)) * RAD2DEG;

  return { longitude: sunLon, distance: R, ra: ((ra % 360) + 360) % 360, dec };
}

function getMoonPosition(date) {
  const JD = dateToJulian(date);
  const T = (JD - J2000) / 36525;

  const L  = (218.3165 + 481267.8813 * T) % 360;
  const D  = (297.8502 + 445267.1115 * T) % 360;
  const M  = (357.5291 + 35999.0503  * T) % 360;
  const Mp = (134.9634 + 477198.8676 * T) % 360;
  const F  = (93.2720  + 483202.0175 * T) % 360;

  const Drad  = D  * DEG2RAD;
  const Mrad  = M  * DEG2RAD;
  const Mprad = Mp * DEG2RAD;
  const Frad  = F  * DEG2RAD;

  let lon = L
    + 6.289 * Math.sin(Mprad)
    - 1.274 * Math.sin(2 * Drad - Mprad)
    + 0.658 * Math.sin(2 * Drad)
    + 0.214 * Math.sin(2 * Mprad)
    - 0.186 * Math.sin(Mrad)
    - 0.114 * Math.sin(2 * Frad);

  let lat = 5.128 * Math.sin(Frad)
    + 0.281 * Math.sin(Mprad + Frad)
    - 0.278 * Math.sin(Frad - Mprad)
    - 0.173 * Math.sin(2 * Drad - Frad);

  return { lon, lat };
}

export function getGMST(date) {
  const JD = dateToJulian(date);
  const T = (JD - J2000) / 36525;
  let gmst = 280.46061837
    + 360.98564736629 * (JD - J2000)
    + 0.000387933 * T * T
    - T * T * T / 38710000;
  return ((gmst % 360) + 360) % 360;
}

// ═══ EARTH ROTATION ═══

export function getEarthRotation(date) {
  const gmst = getGMST(date);
  return -gmst * DEG2RAD;
}

/**
 * Compute the sun direction in world space for the day/night shader.
 * Uses Sun's RA and declination so lighting is astronomically correct,
 * independent of the scaled orbital model.
 *
 * Convention:
 *   In the unrotated Earth mesh, +X = prime meridian (lon 0°).
 *   earth.group.rotation.y = -GMST rotates the prime meridian
 *   to world-space angle GMST from +X.
 *   Therefore RA maps to world-space as:
 *     x = cos(dec)*cos(RA),  y = sin(dec),  z = cos(dec)*sin(RA)
 */
export function getSunDirectionForShader(date) {
  const sun = getSunPosition(date);
  const raRad = sun.ra * DEG2RAD;
  const decRad = sun.dec * DEG2RAD;

  return new THREE.Vector3(
    Math.cos(decRad) * Math.cos(raRad),
    Math.sin(decRad),
    Math.cos(decRad) * Math.sin(raRad),
  ).normalize();
}

/**
 * Compute Earth's orbital position around the Sun.
 * Returns [ angle_rad, Sun ecliptic longitude in deg ].
 * Earth's position is opposite the Sun's ecliptic longitude.
 */
function getEarthOrbitalAngle(date) {
  const sun = getSunPosition(date);
  // Earth is on the opposite side of the Sun
  const earthLon = ((sun.longitude + 180) % 360) * DEG2RAD;
  return earthLon;
}

/**
 * Compute Earth's 3D world position in its orbit around the Sun.
 * The Sun is at sunWorldPos (passed in).
 */
export function getEarthWorldPos(date, sunWorldPos) {
  const angle = getEarthOrbitalAngle(date);
  const r = SCENE.earthOrbitRadius;

  // Earth orbits in the XZ plane (ecliptic)
  const x = sunWorldPos.x + r * Math.cos(angle);
  const y = sunWorldPos.y; // ecliptic plane
  const z = sunWorldPos.z + r * Math.sin(angle);

  return new THREE.Vector3(x, y, z);
}

/**
 * Compute Moon's 3D world position relative to Earth.
 * Uses the Moon's ecliptic longitude from astronomy,
 * with a 5° orbital inclination.
 */
export function getMoonWorldPos(date, earthWorldPos) {
  const moon = getMoonPosition(date);
  const r = SCENE.moonOrbitRadius;

  const lonRad = moon.lon * DEG2RAD;
  const incRad = SCENE.moonInclination * DEG2RAD;

  // Moon orbits in a plane tilted 5° from ecliptic
  const x = earthWorldPos.x + r * Math.cos(lonRad);
  const y = earthWorldPos.y + r * Math.sin(incRad) * Math.sin(lonRad);
  const z = earthWorldPos.z + r * Math.sin(lonRad) * Math.cos(incRad);

  return new THREE.Vector3(x, y, z);
}


// ═══ CREATE SUN (fixed at world position) ═══

export function createSun(scene) {
  const loader = new THREE.TextureLoader();
  const sunTex = loader.load('/src/textures/sun/sun.jpg');
  sunTex.colorSpace = THREE.SRGBColorSpace;

  const geo = new THREE.SphereGeometry(SCENE.sunRadius, 64, 64);
  const mat = new THREE.MeshBasicMaterial({
    map: sunTex,
    emissive: new THREE.Color(0xffdd44),
    emissiveIntensity: 0.3,
  });
  const sunMesh = new THREE.Mesh(geo, mat);

  // Sun glow sprite
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = 256;
  glowCanvas.height = 256;
  const gCtx = glowCanvas.getContext('2d');
  const gradient = gCtx.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0,   'rgba(255, 220, 100, 0.8)');
  gradient.addColorStop(0.2, 'rgba(255, 180, 50, 0.4)');
  gradient.addColorStop(0.5, 'rgba(255, 140, 20, 0.1)');
  gradient.addColorStop(1,   'rgba(255, 100, 0, 0)');
  gCtx.fillStyle = gradient;
  gCtx.fillRect(0, 0, 256, 256);

  const glowTex = new THREE.CanvasTexture(glowCanvas);
  const glowMat = new THREE.SpriteMaterial({
    map: glowTex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.set(SCENE.sunRadius * 6, SCENE.sunRadius * 6, 1);
  sunMesh.add(glow);

  const coronaMat = new THREE.SpriteMaterial({
    map: glowTex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.3,
  });
  const corona = new THREE.Sprite(coronaMat);
  corona.scale.set(SCENE.sunRadius * 10, SCENE.sunRadius * 10, 1);
  sunMesh.add(corona);

  // Sun point light (emanates from sun position)
  const sunPointLight = new THREE.PointLight(0xffffff, 3.0, 200);
  sunMesh.add(sunPointLight);

  scene.add(sunMesh);

  // Fixed world position for the Sun
  const sunWorldPos = new THREE.Vector3(0, 0, 0);
  sunMesh.position.copy(sunWorldPos);

  return {
    mesh: sunMesh,
    worldPos: sunWorldPos,
    update(date) {
      // Sun is fixed — just spin for visual texture animation
      sunMesh.rotation.y += 0.001;
    },
    /**
     * Get the sun direction as seen FROM Earth (for the day/night shader)
     */
    getSunDirFromEarth(earthWorldPos) {
      return sunWorldPos.clone().sub(earthWorldPos).normalize();
    },
  };
}


// ═══ CREATE MOON ═══

export function createMoon(scene) {
  const loader = new THREE.TextureLoader();
  const moonTex = loader.load('/src/textures/moon/moon.jpg');
  moonTex.colorSpace = THREE.SRGBColorSpace;
  moonTex.anisotropy = 8;

  const geo = new THREE.SphereGeometry(SCENE.moonRadius, 64, 64);
  const mat = new THREE.MeshStandardMaterial({
    map: moonTex,
    roughness: 1.0,
    metalness: 0.0,
  });
  const moonMesh = new THREE.Mesh(geo, mat);
  scene.add(moonMesh);

  // Subtle glow
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = 128;
  glowCanvas.height = 128;
  const gCtx = glowCanvas.getContext('2d');
  const gradient = gCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0,   'rgba(200, 210, 230, 0.3)');
  gradient.addColorStop(0.5, 'rgba(180, 200, 220, 0.05)');
  gradient.addColorStop(1,   'rgba(150, 170, 200, 0)');
  gCtx.fillStyle = gradient;
  gCtx.fillRect(0, 0, 128, 128);

  const glowTex = new THREE.CanvasTexture(glowCanvas);
  const glowMat = new THREE.SpriteMaterial({
    map: glowTex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.set(SCENE.moonRadius * 5, SCENE.moonRadius * 5, 1);
  moonMesh.add(glow);

  return {
    mesh: moonMesh,
    update(date, earthWorldPos) {
      const pos = getMoonWorldPos(date, earthWorldPos);
      moonMesh.position.copy(pos);

      // Moon tidally locked — always face Earth
      moonMesh.lookAt(earthWorldPos);
    },
  };
}
