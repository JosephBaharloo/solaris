/**
 * SOLARIS — Turkish Satellite Tracker
 * Renders Turkish satellites on the 3D globe as glowing dots.
 * Color changes based on danger zone proximity.
 *
 * Color scheme:
 *   NOMINAL  — cyan (#00d4ff)
 *   WARNING  — amber (#ffaa00)
 *   CRITICAL — red (#ff2255)
 */
import * as THREE from 'three';

const BACKEND_URL = 'http://localhost:8000';
const POLL_INTERVAL = 30_000; // 30 seconds — matches backend cache TTL

// Colors by danger level
const COLORS = {
  NOMINAL:  0x00d4ff,
  WARNING:  0xffaa00,
  CRITICAL: 0xff2255,
};

const CSS_COLORS = {
  NOMINAL:  '#00d4ff',
  WARNING:  '#ffaa00',
  CRITICAL: '#ff2255',
};

/**
 * Convert lat/lon/altitude to 3D position on/above the globe.
 * Altitude scaling keeps all sats visible near the surface.
 */
function satLatLonToVec3(lat, lon, altitudeKm) {
  // Tight altitude scaling: LEO ≈1.02, GEO ≈1.12
  const radius = 1.015 + Math.min(altitudeKm / 36000, 1) * 0.1;

  const phi = (90 - lat) * Math.PI / 180;
  const lonRad = lon * Math.PI / 180;

  return new THREE.Vector3(
    radius * Math.sin(phi) * Math.cos(lonRad),
    radius * Math.cos(phi),
    -radius * Math.sin(phi) * Math.sin(lonRad),
  );
}


/**
 * Create the satellite tracking system.
 */
export function createSatellites(parent, camera, renderer) {
  const satGroup = new THREE.Group();
  parent.add(satGroup);

  // HTML label container
  const labelContainer = document.createElement('div');
  labelContainer.className = 'sat-label-container';
  labelContainer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:16;';
  document.body.appendChild(labelContainer);

  // Shared geometries
  const dotGeo = new THREE.SphereGeometry(0.012, 8, 8);
  const ringGeo = new THREE.RingGeometry(0.015, 0.022, 16);

  // Active satellite entries: keyed by NORAD ID
  const activeSats = new Map();

  // Visibility flag
  let visible = true;

  function setVisible(v) {
    visible = v;
    satGroup.visible = v;
    labelContainer.style.display = v ? '' : 'none';
  }

  /**
   * Update satellite positions from backend data
   */
  function updateFromData(satData) {
    if (!satData || !satData.satellites) return;

    const incoming = new Set();

    satData.satellites.forEach(sat => {
      incoming.add(sat.norad_id);

      const pos = satLatLonToVec3(sat.lat, sat.lon, sat.altitude_km);
      const danger = sat.danger_level || 'NOMINAL';
      const color = COLORS[danger];

      if (activeSats.has(sat.norad_id)) {
        // Update existing
        const entry = activeSats.get(sat.norad_id);
        entry.dot.position.copy(pos);
        entry.ring.position.copy(pos);
        entry.ring.lookAt(0, 0, 0);
        entry.danger = danger;
        entry.data = sat;

        if (entry.currentLevel !== danger) {
          entry.dotMat.color.setHex(color);
          entry.ringMat.color.setHex(color);
          entry.currentLevel = danger;
          entry.label.style.color = CSS_COLORS[danger];
          entry.label.style.borderColor = CSS_COLORS[danger] + '55';
        }
      } else {
        // Create new satellite dot
        const dotMat = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.95,
        });
        const dot = new THREE.Mesh(dotGeo, dotMat);
        dot.position.copy(pos);
        satGroup.add(dot);

        // Pulsing ring around dot
        const ringMat = new THREE.MeshBasicMaterial({
          color,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.5,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.copy(pos);
        ring.lookAt(0, 0, 0);
        satGroup.add(ring);

        // HTML label
        const label = document.createElement('div');
        label.className = 'sat-label';
        label.innerHTML = `<span class="sat-icon">🛰</span> ${sat.name}`;
        label.style.color = CSS_COLORS[danger];
        label.style.borderColor = CSS_COLORS[danger] + '55';
        labelContainer.appendChild(label);

        activeSats.set(sat.norad_id, {
          dot, dotMat, ring, ringMat, label,
          data: sat,
          danger,
          currentLevel: danger,
        });
      }
    });

    // Remove satellites no longer in the data
    for (const [noradId, entry] of activeSats) {
      if (!incoming.has(noradId)) {
        satGroup.remove(entry.dot);
        satGroup.remove(entry.ring);
        entry.dotMat.dispose();
        entry.ringMat.dispose();
        labelContainer.removeChild(entry.label);
        activeSats.delete(noradId);
      }
    }
  }

  /**
   * Update HTML label positions (called each frame)
   * Dots are children of earth.group, so they rotate automatically.
   */
  function updateLabels() {
    if (!visible) return;

    const canvasRect = renderer.domElement.getBoundingClientRect();

    // Earth center in world space
    const earthCenter = new THREE.Vector3();
    satGroup.getWorldPosition(earthCenter);
    const camDir = camera.position.clone().sub(earthCenter).normalize();

    for (const [, entry] of activeSats) {
      // Get actual world position of the dot (includes earth rotation)
      const worldPos = new THREE.Vector3();
      entry.dot.getWorldPosition(worldPos);

      // Direction from earth center to marker (in world space)
      const markerDir = worldPos.clone().sub(earthCenter).normalize();
      const facing = markerDir.dot(camDir);

      if (facing > 0.05) {
        const projected = worldPos.clone().project(camera);
        const x = (projected.x * 0.5 + 0.5) * canvasRect.width;
        const y = (-projected.y * 0.5 + 0.5) * canvasRect.height;

        entry.label.style.display = 'block';
        entry.label.style.left = x + 'px';
        entry.label.style.top = (y - 14) + 'px';
      } else {
        entry.label.style.display = 'none';
      }
    }
  }

  /**
   * Pulse animation for danger-state satellites
   */
  function update(dt, elapsed) {
    for (const [, entry] of activeSats) {
      const pScale = 1 + Math.sin(elapsed * 2) * 0.25;
      entry.ring.scale.set(pScale, pScale, pScale);

      if (entry.danger === 'CRITICAL') {
        entry.ringMat.opacity = 0.4 + Math.sin(elapsed * 6) * 0.3;
        entry.dotMat.opacity = 0.7 + Math.sin(elapsed * 4) * 0.3;
      } else if (entry.danger === 'WARNING') {
        entry.ringMat.opacity = 0.35 + Math.sin(elapsed * 3) * 0.15;
        entry.dotMat.opacity = 0.9;
      } else {
        entry.ringMat.opacity = 0.3;
        entry.dotMat.opacity = 0.9;
      }
    }
  }

  return {
    satGroup,
    updateFromData,
    updateLabels,
    update,
    setVisible,
    getCount() { return activeSats.size; },
  };
}


/**
 * Start polling the backend for satellite positions.
 */
export function startSatellitePolling(onSatData) {
  async function poll() {
    try {
      const resp = await fetch(`${BACKEND_URL}/satellites`);
      if (resp.ok) {
        const data = await resp.json();
        onSatData(data);
      }
    } catch (err) {
      console.warn('[SAT] Polling failed:', err.message);
    }
  }

  poll();
  setInterval(poll, POLL_INTERVAL);
}
