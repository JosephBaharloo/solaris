/**
 * SOLARIS — Solar Storm CME Particle Animation
 * Renders a dramatic coronal mass ejection (CME) particle stream
 * from the Sun toward Earth when extreme conditions are detected.
 *
 * Activates when Kp >= 5 (WARNING), becomes intense at Kp >= 7 (CRITICAL).
 * Particle colors: yellow → orange → red as they approach Earth.
 */
import * as THREE from 'three';
import { SCENE } from './celestial.js';

const PARTICLE_COUNT = 800;

// Particle texture (soft glow)
function createParticleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255, 200, 80, 1.0)');
  gradient.addColorStop(0.2, 'rgba(255, 150, 40, 0.8)');
  gradient.addColorStop(0.5, 'rgba(255, 80, 20, 0.3)');
  gradient.addColorStop(1, 'rgba(255, 40, 10, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

/**
 * Create the solar storm particle system.
 * @param {THREE.Scene} scene - the main scene
 */
export function createSolarStorm(scene) {
  const particleTex = createParticleTexture();

  // Geometry with position, velocity, progress, and color attributes
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(PARTICLE_COUNT * 3);
  const colors = new Float32Array(PARTICLE_COUNT * 3);
  const sizes = new Float32Array(PARTICLE_COUNT);
  const progress = new Float32Array(PARTICLE_COUNT);   // 0→1 Sun→Earth
  const speeds = new Float32Array(PARTICLE_COUNT);     // individual speed
  const offsets = new Float32Array(PARTICLE_COUNT * 2); // lateral offsets (x,y)

  // Initialize particles
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    progress[i] = Math.random(); // random starting progress
    speeds[i] = 0.15 + Math.random() * 0.25; // speed variation
    sizes[i] = 0.08 + Math.random() * 0.15;

    // Random lateral offset (forms a cone shape)
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * 1.5; // cone spread
    offsets[i * 2] = Math.cos(angle) * radius;
    offsets[i * 2 + 1] = Math.sin(angle) * radius;

    // Initial position (will be overwritten in update)
    positions[i * 3] = 0;
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = 0;

    // Initial color (yellow)
    colors[i * 3] = 1;
    colors[i * 3 + 1] = 0.8;
    colors[i * 3 + 2] = 0.3;
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));

  // Custom shader material for size attenuation and per-particle color
  const material = new THREE.PointsMaterial({
    map: particleTex,
    size: 0.15,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    vertexColors: true,
    sizeAttenuation: true,
  });

  const particles = new THREE.Points(geometry, material);
  particles.frustumCulled = false;
  scene.add(particles);

  // Glow trail line (central beam)
  const beamGeometry = new THREE.BufferGeometry();
  const beamPositions = new Float32Array(6); // 2 points
  beamGeometry.setAttribute('position', new THREE.Float32BufferAttribute(beamPositions, 3));

  const beamMaterial = new THREE.LineBasicMaterial({
    color: 0xff8800,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    linewidth: 1,
  });
  const beam = new THREE.Line(beamGeometry, beamMaterial);
  beam.frustumCulled = false;
  scene.add(beam);

  // Shockwave ring at Earth (visible on impact)
  const ringGeo = new THREE.RingGeometry(0.8, 1.4, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xff4400,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const shockwaveRing = new THREE.Mesh(ringGeo, ringMat);
  shockwaveRing.frustumCulled = false;
  scene.add(shockwaveRing);

  // State
  let intensity = 0;       // 0 = off, 1 = full
  let targetIntensity = 0;
  let currentKp = 0;

  /**
   * Set storm intensity based on Kp level.
   *   Kp < 5: off
   *   Kp 5-6: low (0.3-0.5)
   *   Kp 7-8: medium (0.6-0.8)
   *   Kp 9:   full (1.0)
   */
  function setStormIntensity(kp) {
    currentKp = kp;
    if (kp < 5) {
      targetIntensity = 0;
    } else if (kp < 7) {
      targetIntensity = 0.3 + (kp - 5) * 0.1;
    } else if (kp < 9) {
      targetIntensity = 0.6 + (kp - 7) * 0.1;
    } else {
      targetIntensity = 1.0;
    }
  }

  /**
   * Update particle positions each frame.
   * @param {number} dt - delta time
   * @param {number} elapsed - total time
   * @param {THREE.Vector3} earthPos - current Earth world position
   * @param {THREE.Vector3} sunPos - Sun world position
   */
  function update(dt, elapsed, earthPos, sunPos) {
    // Smoothly interpolate intensity
    intensity += (targetIntensity - intensity) * Math.min(dt * 2, 1);

    // Fade out if very low
    if (intensity < 0.01) {
      material.opacity = 0;
      beamMaterial.opacity = 0;
      ringMat.opacity = 0;
      return;
    }

    material.opacity = intensity * 0.7;

    // Direction vector from Sun to Earth
    const dir = earthPos.clone().sub(sunPos);
    const totalDist = dir.length();
    dir.normalize();

    // Compute a perpendicular basis for the cone spread
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(dir, up).normalize();
    const perpUp = new THREE.Vector3().crossVectors(right, dir).normalize();

    const posAttr = geometry.getAttribute('position');
    const colorAttr = geometry.getAttribute('color');

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // Advance progress
      progress[i] += speeds[i] * dt * (0.5 + intensity * 0.5);

      // Loop back when reaching Earth
      if (progress[i] > 1.0) {
        progress[i] = 0;
        speeds[i] = 0.15 + Math.random() * 0.25;
        // Re-randomize lateral offset
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * 1.5;
        offsets[i * 2] = Math.cos(angle) * radius;
        offsets[i * 2 + 1] = Math.sin(angle) * radius;
      }

      const t = progress[i]; // 0 at Sun, 1 at Earth

      // Position along the Sun→Earth line
      const alongDist = t * totalDist;

      // Cone narrows as it approaches Earth: spread factor tapers
      const spreadFactor = (1 - t * 0.7) * intensity;
      const lateralX = offsets[i * 2] * spreadFactor;
      const lateralY = offsets[i * 2 + 1] * spreadFactor;

      // Start slightly outside Sun surface
      const startOffset = SCENE.sunRadius * 1.1;
      const effectiveDist = startOffset + alongDist * (1 - startOffset / totalDist);

      const px = sunPos.x + dir.x * effectiveDist + right.x * lateralX + perpUp.x * lateralY;
      const py = sunPos.y + dir.y * effectiveDist + right.y * lateralX + perpUp.y * lateralY;
      const pz = sunPos.z + dir.z * effectiveDist + right.z * lateralX + perpUp.z * lateralY;

      posAttr.setXYZ(i, px, py, pz);

      // Color: yellow at Sun → orange mid → red near Earth
      let r, g, b;
      if (t < 0.3) {
        // Yellow → orange
        const s = t / 0.3;
        r = 1;
        g = 0.85 - s * 0.35;
        b = 0.3 - s * 0.2;
      } else if (t < 0.7) {
        // Orange
        const s = (t - 0.3) / 0.4;
        r = 1;
        g = 0.5 - s * 0.2;
        b = 0.1 - s * 0.05;
      } else {
        // Orange → red
        const s = (t - 0.7) / 0.3;
        r = 1;
        g = 0.3 - s * 0.2;
        b = 0.05;
      }
      colorAttr.setXYZ(i, r, g, b);
    }

    posAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;

    // Central beam from Sun to Earth
    const beamPosAttr = beam.geometry.getAttribute('position');
    beamPosAttr.setXYZ(0,
      sunPos.x + dir.x * SCENE.sunRadius * 1.2,
      sunPos.y + dir.y * SCENE.sunRadius * 1.2,
      sunPos.z + dir.z * SCENE.sunRadius * 1.2,
    );
    beamPosAttr.setXYZ(1, earthPos.x, earthPos.y, earthPos.z);
    beamPosAttr.needsUpdate = true;
    beamMaterial.opacity = intensity * 0.12;

    // Shockwave ring at Earth
    shockwaveRing.position.copy(earthPos);
    shockwaveRing.lookAt(sunPos);
    const pulse = Math.sin(elapsed * 3) * 0.5 + 0.5;
    const ringScale = 1.0 + pulse * 0.4;
    shockwaveRing.scale.set(ringScale, ringScale, ringScale);
    ringMat.opacity = intensity * 0.15 * (0.5 + pulse * 0.5);
  }

  return {
    particles,
    setStormIntensity,
    update,
  };
}
