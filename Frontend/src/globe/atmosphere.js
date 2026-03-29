/**
 * SOLARIS — Atmosphere Shader
 * Fresnel rim-glow effect for Earth atmosphere
 */
import * as THREE from 'three';

export function createAtmosphere(parent) {
  const geometry = new THREE.SphereGeometry(1.04, 96, 96);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      glowColor: { value: new THREE.Color(0x00aaff) },
      intensity: { value: 0.7 },
      power: { value: 4.0 },
      pulseTime: { value: 0.0 },
      stormIntensity: { value: 0.0 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vWorldPosition;

      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform vec3 glowColor;
      uniform float intensity;
      uniform float power;
      uniform float pulseTime;
      uniform float stormIntensity;

      varying vec3 vNormal;
      varying vec3 vWorldPosition;

      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        float rim = 1.0 - max(0.0, dot(viewDir, vNormal));
        rim = pow(rim, power);

        // Pulse during storms
        float pulse = 1.0 + sin(pulseTime * 2.0) * 0.15 * stormIntensity;

        // Color shift toward red during storms
        vec3 stormColor = mix(glowColor, vec3(1.0, 0.3, 0.1), stormIntensity * 0.5);

        float alpha = rim * intensity * pulse;
        gl_FragColor = vec4(stormColor, alpha);
      }
    `,
    transparent: true,
    side: THREE.BackSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const mesh = new THREE.Mesh(geometry, material);
  parent.add(mesh);

  return {
    mesh,
    material,
    setStormLevel(level) {
      // level 0-1 representing storm severity
      material.uniforms.stormIntensity.value = level;
    },
    update(dt, elapsed) {
      material.uniforms.pulseTime.value = elapsed;
    },
  };
}
