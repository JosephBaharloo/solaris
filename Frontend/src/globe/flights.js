/**
 * SOLARIS — Real-Time Flight Tracker
 * Renders Turkish airline flights on the 3D globe.
 * Uses OpenSky Network data via backend.
 *
 * Airline colors:
 *   THY (Turkish Airlines) — #cc0000 (red)
 *   PGT (Pegasus)          — #ffaa00 (amber)
 *   SXS (SunExpress)       — #ffe600 (yellow)
 *   FHY (Freebird)         — #00c4ff (cyan)
 *   CAI (Corendon)         — #ff6622 (orange)
 */
import * as THREE from 'three';

const BACKEND_URL = 'http://localhost:8000';
const POLL_INTERVAL = 15_000; // 15 seconds

// Airline brand colors
const AIRLINE_COLORS = {
  THY: { hex: 0xcc0000, css: '#cc0000' },
  PGT: { hex: 0xffaa00, css: '#ffaa00' },
  SXS: { hex: 0xffe600, css: '#ffe600' },
  FHY: { hex: 0x00c4ff, css: '#00c4ff' },
  CAI: { hex: 0xff6622, css: '#ff6622' },
};

const DEFAULT_COLOR = { hex: 0x00d4ff, css: '#00d4ff' };

/**
 * Convert lat/lon/altitude to 3D position above the globe.
 */
function flightLatLonToVec3(lat, lon, altitudeM) {
  // Aircraft altitude compressed: cruising altitude ~10km → ~1.015
  const altKm = altitudeM / 1000;
  const radius = 1.005 + Math.min(altKm / 50, 0.5) * 0.02;

  const phi = (90 - lat) * Math.PI / 180;
  const lonRad = lon * Math.PI / 180;

  return new THREE.Vector3(
    radius * Math.sin(phi) * Math.cos(lonRad),
    radius * Math.cos(phi),
    -radius * Math.sin(phi) * Math.sin(lonRad),
  );
}


/**
 * Create the flight tracking system.
 */
export function createFlights(parent, camera, renderer) {
  const flightGroup = new THREE.Group();
  parent.add(flightGroup);

  // HTML label container
  const labelContainer = document.createElement('div');
  labelContainer.className = 'flight-label-container';
  labelContainer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:17;';
  document.body.appendChild(labelContainer);

  // Shared geometry for airplane dots
  const dotGeo = new THREE.ConeGeometry(0.008, 0.02, 3);
  dotGeo.rotateX(Math.PI / 2); // Point forward

  // Active flights: keyed by callsign
  const activeFlights = new Map();
  let visible = true;

  function setVisible(v) {
    visible = v;
    flightGroup.visible = v;
    labelContainer.style.display = v ? '' : 'none';
  }

  /**
   * Update flight positions from backend data
   */
  function updateFromData(flightData) {
    if (!flightData || !flightData.flights) return;

    const incoming = new Set();

    flightData.flights.forEach(f => {
      if (f.on_ground) return; // Skip grounded aircraft

      incoming.add(f.callsign);
      const pos = flightLatLonToVec3(f.lat, f.lon, f.altitude_m);
      const colorSet = AIRLINE_COLORS[f.airline_code] || DEFAULT_COLOR;

      if (activeFlights.has(f.callsign)) {
        // Update existing
        const entry = activeFlights.get(f.callsign);
        entry.mesh.position.copy(pos);
        entry.data = f;

        // Orient cone in heading direction
        if (f.heading) {
          const headingRad = (f.heading * Math.PI) / 180;
          entry.mesh.rotation.y = -headingRad;
        }
      } else {
        // Create new flight marker
        const mat = new THREE.MeshBasicMaterial({
          color: colorSet.hex,
          transparent: true,
          opacity: 0.95,
        });
        const mesh = new THREE.Mesh(dotGeo, mat);
        mesh.position.copy(pos);
        flightGroup.add(mesh);

        // Trail ring
        const ringGeo = new THREE.RingGeometry(0.004, 0.008, 8);
        const ringMat = new THREE.MeshBasicMaterial({
          color: colorSet.hex,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.35,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.copy(pos);
        ring.lookAt(0, 0, 0);
        flightGroup.add(ring);

        // HTML label
        const label = document.createElement('div');
        label.className = 'flight-3d-label';
        label.innerHTML = `<span class="flight-3d-icon">✈</span> ${f.callsign}`;
        label.style.color = colorSet.css;
        label.style.borderColor = colorSet.css + '55';
        labelContainer.appendChild(label);

        activeFlights.set(f.callsign, {
          mesh, mat, ring, ringMat, label,
          data: f,
        });
      }
    });

    // Remove flights no longer in data
    for (const [callsign, entry] of activeFlights) {
      if (!incoming.has(callsign)) {
        flightGroup.remove(entry.mesh);
        flightGroup.remove(entry.ring);
        entry.mat.dispose();
        entry.ringMat.dispose();
        labelContainer.removeChild(entry.label);
        activeFlights.delete(callsign);
      }
    }
  }

  /**
   * Update HTML label positions (called each frame)
   * Meshes rotate with earth.group, so use actual world positions.
   */
  function updateLabels() {
    if (!visible) return;

    const canvasRect = renderer.domElement.getBoundingClientRect();

    // Earth center in world space
    const earthCenter = new THREE.Vector3();
    flightGroup.getWorldPosition(earthCenter);
    const camDir = camera.position.clone().sub(earthCenter).normalize();

    for (const [, entry] of activeFlights) {
      // Get actual world position (includes earth rotation)
      const worldPos = new THREE.Vector3();
      entry.mesh.getWorldPosition(worldPos);

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
   * Pulse animation
   */
  function update(dt, elapsed) {
    for (const [, entry] of activeFlights) {
      const pScale = 1 + Math.sin(elapsed * 2.5) * 0.2;
      entry.ring.scale.set(pScale, pScale, pScale);
      entry.ringMat.opacity = 0.25 + Math.sin(elapsed * 2) * 0.1;
    }
  }

  return {
    flightGroup,
    updateFromData,
    updateLabels,
    update,
    setVisible,
    getCount() { return activeFlights.size; },
  };
}


/**
 * Start polling the backend for flight positions.
 */
export function startFlightPolling(onFlightData) {
  async function poll() {
    try {
      const resp = await fetch(`${BACKEND_URL}/flights`);
      if (resp.ok) {
        const data = await resp.json();
        onFlightData(data);
      }
    } catch (err) {
      console.warn('[FLIGHT] Polling failed:', err.message);
    }
  }

  poll();
  setInterval(poll, POLL_INTERVAL);
}
