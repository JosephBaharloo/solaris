/**
 * SOLARIS — 3D Earth Globe
 * Photorealistic Earth using real NASA textures with enhanced shader
 */
import * as THREE from 'three';

export function createEarth(parent) {
  const group = new THREE.Group();
  const loader = new THREE.TextureLoader();

  // ═══ LOAD TEXTURES ═══
  const dayMap = loader.load('/src/textures/earth/earth_daymap.jpg');
  const nightMap = loader.load('/src/textures/earth/earth_nightmap.jpg');
  const specMap = loader.load('/src/textures/earth/earth_specular_map.jpg');
  const cloudMap = loader.load('/src/textures/earth/earth_clouds.jpg');

  // High quality texture settings
  [dayMap, nightMap, specMap, cloudMap].forEach(tex => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 16;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
  });

  // ═══ EARTH SPHERE ═══
  const geometry = new THREE.SphereGeometry(1, 128, 128);

  const earthMaterial = new THREE.ShaderMaterial({
    uniforms: {
      dayMap: { value: dayMap },
      nightMap: { value: nightMap },
      specMap: { value: specMap },
      sunDirection: { value: new THREE.Vector3(5, 3, 5).normalize() },
      ambientStrength: { value: 0.08 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      varying vec3 vViewDir;

      void main() {
        vUv = uv;
        // Compute normal in WORLD space (not view space) to match sunDirection
        vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        vViewDir = normalize(cameraPosition - worldPos.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform sampler2D dayMap;
      uniform sampler2D nightMap;
      uniform sampler2D specMap;
      uniform vec3 sunDirection;
      uniform float ambientStrength;

      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      varying vec3 vViewDir;

      void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewDir);
        float NdotL = dot(normal, sunDirection);

        // Sample textures
        vec3 dayColor = texture2D(dayMap, vUv).rgb;
        vec3 nightColor = texture2D(nightMap, vUv).rgb;
        float specMask = texture2D(specMap, vUv).r;

        // ─── LIGHTING MODEL ───

        // Diffuse with soft wrap-around (atmosphere scattering)
        float diffuse = smoothstep(-0.15, 0.35, NdotL);

        // Boost day color
        dayColor = pow(dayColor, vec3(0.95));
        dayColor *= 1.15;

        // Night side: boost city lights
        nightColor *= 2.5;
        nightColor = pow(nightColor, vec3(0.8));

        // Blend day ↔ night
        vec3 surfaceColor = mix(nightColor, dayColor, diffuse);

        // ─── SPECULAR (oceans) ───
        vec3 halfDir = normalize(sunDirection + viewDir);
        float specAngle = max(0.0, dot(normal, halfDir));
        float specular = pow(specAngle, 64.0) * specMask * diffuse;
        surfaceColor += vec3(0.6, 0.7, 0.9) * specular * 0.4;

        // ─── FRESNEL RIM ───
        float rim = 1.0 - max(0.0, dot(viewDir, normal));
        rim = pow(rim, 4.0);
        vec3 atmosphereColor = vec3(0.3, 0.6, 1.0);
        surfaceColor = mix(surfaceColor, atmosphereColor, rim * 0.35);

        // ─── TERMINATOR GLOW ───
        float terminator = 1.0 - smoothstep(0.0, 0.15, abs(NdotL));
        vec3 terminatorColor = vec3(1.0, 0.4, 0.15);
        surfaceColor += terminatorColor * terminator * 0.08 * diffuse;

        // ─── AMBIENT ───
        surfaceColor += dayColor * ambientStrength;

        // ─── TONE MAPPING ───
        surfaceColor = surfaceColor / (surfaceColor + vec3(1.0));

        gl_FragColor = vec4(surfaceColor, 1.0);
      }
    `,
  });

  const earthMesh = new THREE.Mesh(geometry, earthMaterial);
  group.add(earthMesh);

  // ═══ CLOUD LAYER ═══
  const cloudGeo = new THREE.SphereGeometry(1.007, 96, 96);
  const cloudMat = new THREE.ShaderMaterial({
    uniforms: {
      cloudMap: { value: cloudMap },
      sunDirection: { value: new THREE.Vector3(5, 3, 5).normalize() },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;

      void main() {
        vUv = uv;
        vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D cloudMap;
      uniform vec3 sunDirection;

      varying vec2 vUv;
      varying vec3 vNormal;

      void main() {
        float cloud = texture2D(cloudMap, vUv).r;
        float NdotL = dot(normalize(vNormal), sunDirection);
        float light = smoothstep(-0.1, 0.4, NdotL);

        // Clouds are white on the day side, invisible on night side
        float alpha = cloud * light * 0.55;

        // Slight bluish tint to white clouds
        vec3 cloudColor = vec3(0.95, 0.97, 1.0) * light;

        gl_FragColor = vec4(cloudColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
  });
  const clouds = new THREE.Mesh(cloudGeo, cloudMat);
  group.add(clouds);

  parent.add(group);

  return {
    group,
    earthMesh,
    clouds,
    material: earthMaterial,
    setSunDirection(dir) {
      earthMaterial.uniforms.sunDirection.value.copy(dir);
      cloudMat.uniforms.sunDirection.value.copy(dir);
    },
    update(dt) {
      // Earth rotation is now driven externally by UTC time (main.js)
      // Only drift clouds slightly relative to Earth
      clouds.rotation.y += dt * 0.003;
      clouds.rotation.x += dt * 0.001;
    },
  };
}
