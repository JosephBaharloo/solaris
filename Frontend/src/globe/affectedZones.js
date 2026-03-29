/**
 * SOLARIS — Affected Zones
 * Renders storm impact zones on the globe based on Kp value
 */
import * as THREE from 'three';

export function createAffectedZones(parent) {
  const group = new THREE.Group();

  // North affected zone ring
  const northZone = createZoneRing(1.004, 60, 90, 0xff2255);
  group.add(northZone.mesh);

  // South affected zone ring
  const southZone = createZoneRing(1.004, -90, -60, 0xff2255);
  group.add(southZone.mesh);

  // D-Region absorption zone (equatorial/mid-lat)
  const dRegion = createZoneRing(1.003, -30, 30, 0xff6622);
  group.add(dRegion.mesh);
  dRegion.mesh.visible = false;


  // Group is added to earth.group by main.js

  return {
    group,
    update(dt, elapsed, kpValue, xrayFlux) {
      // Kp-based affected zone
      const affectedLat = 90 - kpValue * 7.5;
      const zoneMin = Math.max(0, affectedLat);

      updateZoneRange(northZone, zoneMin, 90, elapsed);
      updateZoneRange(southZone, -90, -zoneMin, elapsed);

      // Set visibility based on severity
      const visible = kpValue >= 4;
      northZone.mesh.visible = visible;
      southZone.mesh.visible = visible;

      // D-Region for X-ray events
      const showDRegion = xrayFlux > 1e-5;
      dRegion.mesh.visible = showDRegion;
      if (showDRegion) {
        dRegion.material.uniforms.time.value = elapsed;
        dRegion.material.uniforms.opacity.value = Math.min(0.3, xrayFlux * 1e4);
      }
    },
  };
}

function createZoneRing(radius, latMin, latMax, color) {
  const segments = 64;
  const rings = 16;
  const geometry = new THREE.BufferGeometry();

  const { positions, uvs } = generateZoneGeometry(radius, latMin, latMax, segments, rings);

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(color) },
      time: { value: 0 },
      opacity: { value: 0.15 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      uniform float time;
      uniform float opacity;
      varying vec2 vUv;

      void main() {
        float pulse = 0.5 + 0.5 * sin(time * 2.0 + vUv.x * 10.0);
        float edgeFade = sin(vUv.y * 3.14159);
        float alpha = opacity * pulse * edgeFade;
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });

  const mesh = new THREE.Mesh(geometry, material);

  return { mesh, geometry, material };
}

function generateZoneGeometry(radius, latMin, latMax, segments, rings) {
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let r = 0; r <= rings; r++) {
    const lat = latMin + (latMax - latMin) * (r / rings);
    const phi = (90 - lat) * Math.PI / 180;
    const v = r / rings;

    for (let s = 0; s <= segments; s++) {
      const theta = (s / segments) * Math.PI * 2;
      const u = s / segments;

      positions.push(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta),
      );
      uvs.push(u, v);
    }
  }

  return { positions, uvs };
}

function updateZoneRange(zone, latMin, latMax, elapsed) {
  const segments = 64;
  const rings = 16;
  const radius = 1.004;
  const positions = zone.geometry.attributes.position.array;

  let idx = 0;
  for (let r = 0; r <= rings; r++) {
    const lat = latMin + (latMax - latMin) * (r / rings);
    const phi = (90 - lat) * Math.PI / 180;

    for (let s = 0; s <= segments; s++) {
      const theta = (s / segments) * Math.PI * 2;
      positions[idx++] = radius * Math.sin(phi) * Math.cos(theta);
      positions[idx++] = radius * Math.cos(phi);
      positions[idx++] = radius * Math.sin(phi) * Math.sin(theta);
    }
  }

  zone.geometry.attributes.position.needsUpdate = true;
  zone.material.uniforms.time.value = elapsed;
}
