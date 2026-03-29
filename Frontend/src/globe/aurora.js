/**
 * SOLARIS — Aurora Visualization
 * Renders dynamic aurora bands on the globe based on OVATION data
 */
import * as THREE from 'three';

export function createAurora(parent) {
  const group = new THREE.Group();

  // North aurora ring
  const northAurora = createAuroraRing(1.015, 65, 75, true);
  group.add(northAurora.mesh);

  // South aurora ring
  const southAurora = createAuroraRing(1.015, -75, -65, false);
  group.add(southAurora.mesh);

  // Aurora particles
  const particles = createAuroraParticles(65, 75);
  group.add(particles.points);

  parent.add(group);

  return {
    group,
    setKpLevel(kp) {
      // As Kp increases, aurora moves equatorward
      const latShift = kp * 2.5; // degrees equatorward
      const newMinLat = 65 - latShift;
      const newMaxLat = 75 - latShift * 0.5;

      // Adjust aurora intensity
      const intensity = Math.min(1, kp / 7);
      northAurora.setIntensity(intensity);
      southAurora.setIntensity(intensity);
      particles.setIntensity(intensity);

      // Update position
      northAurora.setLatRange(newMinLat, newMaxLat);
      southAurora.setLatRange(-newMaxLat, -newMinLat);
    },
    update(dt, elapsed) {
      northAurora.update(dt, elapsed);
      southAurora.update(dt, elapsed);
      particles.update(dt, elapsed);
    },
  };
}

function createAuroraRing(radius, latMin, latMax, isNorth) {
  const segments = 128;
  const rings = 8;
  const geometry = new THREE.BufferGeometry();
  const positions = [];
  const colors = [];
  const alphas = [];

  for (let r = 0; r < rings; r++) {
    const lat = latMin + (latMax - latMin) * (r / (rings - 1));
    const phi = (90 - lat) * Math.PI / 180;

    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.cos(phi);
      const z = radius * Math.sin(phi) * Math.sin(theta);
      positions.push(x, y, z);

      // Color: green core, purple edges
      const t = r / (rings - 1);
      const green = 0.3 + (1 - Math.abs(t - 0.5) * 2) * 0.7;
      const red = t * 0.4;
      const blue = t * 0.3;
      colors.push(red, green, blue);

      alphas.push(0.15 + (1 - Math.abs(t - 0.4) * 2) * 0.3);
    }
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      intensity: { value: 0.5 },
      time: { value: 0 },
    },
    vertexShader: `
      attribute vec3 color;
      varying vec3 vColor;
      varying float vAlpha;
      uniform float time;
      uniform float intensity;

      void main() {
        vColor = color;
        vec3 pos = position;
        // Animate aurora
        float wave = sin(pos.x * 5.0 + time * 0.5) * 0.005 * intensity;
        pos += normal * wave;
        vAlpha = intensity * (0.2 + 0.3 * sin(pos.y * 10.0 + time));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = 2.0;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        gl_FragColor = vec4(vColor, vAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const mesh = new THREE.Points(geometry, material);

  let currentLatMin = latMin;
  let currentLatMax = latMax;

  return {
    mesh,
    setIntensity(val) {
      material.uniforms.intensity.value = val;
    },
    setLatRange(min, max) {
      currentLatMin = min;
      currentLatMax = max;
      rebuildGeometry(geometry, radius, min, max, segments, rings);
    },
    update(dt, elapsed) {
      material.uniforms.time.value = elapsed;
    },
  };
}

function rebuildGeometry(geometry, radius, latMin, latMax, segments, rings) {
  const positions = geometry.attributes.position.array;
  let idx = 0;
  for (let r = 0; r < rings; r++) {
    const lat = latMin + (latMax - latMin) * (r / (rings - 1));
    const phi = (90 - lat) * Math.PI / 180;
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      positions[idx++] = radius * Math.sin(phi) * Math.cos(theta);
      positions[idx++] = radius * Math.cos(phi);
      positions[idx++] = radius * Math.sin(phi) * Math.sin(theta);
    }
  }
  geometry.attributes.position.needsUpdate = true;
}

function createAuroraParticles(latMin, latMax) {
  const count = 2000;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  const radius = 1.02;

  for (let i = 0; i < count; i++) {
    const lat = latMin + Math.random() * (latMax - latMin);
    const lon = Math.random() * 360 - 180;
    const phi = (90 - lat) * Math.PI / 180;
    const lonRad = lon * Math.PI / 180;

    positions[i * 3] = radius * Math.sin(phi) * Math.cos(lonRad);
    positions[i * 3 + 1] = radius * Math.cos(phi);
    positions[i * 3 + 2] = -radius * Math.sin(phi) * Math.sin(lonRad);

    // Green tones
    colors[i * 3] = 0.1 + Math.random() * 0.2;
    colors[i * 3 + 1] = 0.5 + Math.random() * 0.5;
    colors[i * 3 + 2] = 0.1 + Math.random() * 0.3;

    sizes[i] = 1 + Math.random() * 3;
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));

  const material = new THREE.PointsMaterial({
    size: 0.008,
    vertexColors: true,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);

  return {
    points,
    setIntensity(val) {
      material.opacity = val * 0.6;
    },
    update(dt, elapsed) {
      points.rotation.y += dt * 0.01;
    },
  };
}
