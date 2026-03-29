/**
 * SOLARIS — Globe Markers
 * Airport/city markers on the 3D globe with labels
 */
import * as THREE from 'three';

const MARKERS = [
  { name: 'NEW YORK, NY', lat: 40.7, lon: -74.0, code: 'JFK' },
  { name: 'LONDON, UK', lat: 51.5, lon: -0.1, code: 'LHR' },
  { name: 'TOKYO, JP', lat: 35.7, lon: 139.7, code: 'NRT' },
  { name: 'SEATTLE, WA', lat: 47.6, lon: -122.3, code: 'SEA' },
  { name: 'LOS ANGELES, CA', lat: 34.0, lon: -118.2, code: 'LAX' },
  { name: 'SAN FRANCISCO, CA', lat: 37.8, lon: -122.4, code: 'SFO' },
  { name: 'WASHINGTON, DC', lat: 38.9, lon: -77.0, code: 'IAD' },
  { name: 'CHICAGO, IL', lat: 41.9, lon: -87.6, code: 'ORD' },
  { name: 'FRANKFURT, DE', lat: 50.0, lon: 8.6, code: 'FRA' },
  { name: 'PARIS, FR', lat: 49.0, lon: 2.6, code: 'CDG' },
  { name: 'HELSINKI, FI', lat: 60.3, lon: 25.0, code: 'HEL' },
  { name: 'REYKJAVIK, IS', lat: 64.0, lon: -22.6, code: 'KEF' },
  { name: 'SEOUL, KR', lat: 37.5, lon: 126.4, code: 'ICN' },
  { name: 'MIAMI, FL', lat: 25.8, lon: -80.2, code: 'MIA' },
  { name: 'DUBAI, AE', lat: 25.3, lon: 55.4, code: 'DXB' },
  { name: 'SINGAPORE', lat: 1.4, lon: 104.0, code: 'SIN' },
];

export function createMarkers(parent, camera, renderer) {
  const markerGroup = new THREE.Group();
  const labelContainer = document.createElement('div');
  labelContainer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:15;';
  document.body.appendChild(labelContainer);

  const markerGeo = new THREE.SphereGeometry(0.008, 8, 8);

  const markers = MARKERS.map(m => {
    // 3D position on globe — matches Three.js SphereGeometry UV convention
    const phi = (90 - m.lat) * Math.PI / 180;   // 0 at north pole, π at south pole
    const lonRad = m.lon * Math.PI / 180;        // longitude in radians
    const radius = 1.005;

    const pos = new THREE.Vector3(
      radius * Math.sin(phi) * Math.cos(lonRad),
      radius * Math.cos(phi),
      -radius * Math.sin(phi) * Math.sin(lonRad),
    );

    // Marker dot
    const mat = new THREE.MeshBasicMaterial({
      color: 0x00d4ff,
      transparent: true,
      opacity: 0.9,
    });
    const dot = new THREE.Mesh(markerGeo, mat);
    dot.position.copy(pos);
    markerGroup.add(dot);

    // Pulsing ring
    const ringGeo = new THREE.RingGeometry(0.01, 0.015, 16);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00d4ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.4,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(pos);
    ring.lookAt(new THREE.Vector3(0, 0, 0));
    markerGroup.add(ring);

    // HTML label
    const label = document.createElement('div');
    label.className = 'globe-label';
    label.textContent = m.name;
    label.style.display = 'none';
    labelContainer.appendChild(label);

    return { ...m, dot, ring, label, position: pos, material: mat };
  });

  parent.add(markerGroup);

  return {
    markerGroup,
    markers,
    updateLabels() {
      const canvasRect = renderer.domElement.getBoundingClientRect();

      // Earth center in world space
      const earthCenter = new THREE.Vector3();
      markerGroup.getWorldPosition(earthCenter);
      const camToEarth = camera.position.clone().sub(earthCenter).normalize();

      markers.forEach(m => {
        // Get actual world position of the dot (includes earth rotation)
        const worldPos = new THREE.Vector3();
        m.dot.getWorldPosition(worldPos);

        // Direction from earth center to marker (in world space)
        const markerDir = worldPos.clone().sub(earthCenter).normalize();
        const facing = markerDir.dot(camToEarth);

        if (facing > 0.15) {
          // Project to screen
          const projected = worldPos.clone().project(camera);
          const x = (projected.x * 0.5 + 0.5) * canvasRect.width;
          const y = (-projected.y * 0.5 + 0.5) * canvasRect.height;

          m.label.style.display = 'block';
          m.label.style.left = x + 'px';
          m.label.style.top = (y - 20) + 'px';
        } else {
          m.label.style.display = 'none';
        }
      });
    },
    setMarkerStatus(kpValue) {
      const affectedLat = 90 - kpValue * 7.5;
      markers.forEach(m => {
        if (Math.abs(m.lat) > affectedLat) {
          m.material.color.setHex(0xff2255);
          m.label.style.borderColor = 'rgba(255,34,85,0.5)';
        } else if (Math.abs(m.lat) > affectedLat - 10) {
          m.material.color.setHex(0xffaa00);
          m.label.style.borderColor = 'rgba(255,170,0,0.5)';
        } else {
          m.material.color.setHex(0x00d4ff);
          m.label.style.borderColor = 'rgba(0,212,255,0.18)';
        }
      });
    },
    update(dt, elapsed) {
      markers.forEach(m => {
        const scale = 1 + Math.sin(elapsed * 2) * 0.2;
        m.ring.scale.set(scale, scale, scale);
      });
    },
  };
}
