import * as THREE from "three";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";

/** A photographed sky in one draw call. No cloud simulation or per-frame texture updates. */
export function createSky(sun: THREE.Vector3, haze: THREE.Color) {
  const uniforms = {
    uSky: { value: null as THREE.DataTexture | null },
    uReady: { value: 0 },
    uSun: { value: sun },
    uHaze: { value: haze },
  };
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vDirection;
      void main() {
        vDirection = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uSky;
      uniform float uReady;
      uniform vec3 uSun, uHaze;
      varying vec3 vDirection;
      const float PI = 3.14159265359;
      void main() {
        vec3 d = normalize(vDirection);
        float afternoon = 1.0 - smoothstep(0.36, 0.57, uSun.y);
        vec3 haze = uHaze * mix(vec3(1.0), vec3(1.08, 1.0, 0.89), afternoon);
        // The source sun is at pixel (1218, 239) in a 2048 x 1024 panorama.
        // Align azimuth and elevation while leaving the horizon level in both light modes.
        float sourceAzimuth = ((1218.5 / 2048.0) - 0.5) * 2.0 * PI;
        float sourceElevation = (0.5 - 239.5 / 1024.0) * PI;
        float elevationScale = tan(sourceElevation) / max(tan(asin(uSun.y)), 0.1);
        vec3 sampleDirection = normalize(vec3(d.x, d.y * elevationScale, d.z));
        float u = (atan(d.z, d.x) + sourceAzimuth - atan(uSun.z, uSun.x)) / (2.0 * PI) + 0.5;
        float v = asin(clamp(sampleDirection.y, -1.0, 1.0)) / PI + 0.5;
        vec3 sky = mix(haze, vec3(0.075, 0.19, 0.40), smoothstep(0.0, 0.85, d.y));
        if (uReady > 0.5) {
          sky = texture2D(uSky, vec2(fract(u), v)).rgb;
          sky *= mix(vec3(1.0), vec3(1.11, 0.98, 0.83), afternoon);
        }
        // Hide the lower hemisphere and join the distant terrain without a hard seam.
        sky = mix(haze, sky, smoothstep(-0.025, 0.12, d.y));
        gl_FragColor = vec4(sky, 1.0);
        // OutputPass applies exposure, tone mapping and display colour conversion once.
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(9000, 32, 16), material);
  mesh.name = "Photographic sky";
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.onBeforeRender = (_renderer, _scene, camera) => {
    // A sky has no parallax when the user walks or flies across the map.
    mesh.position.copy(camera.position);
    mesh.updateMatrixWorld();
  };
  // Separate manager: this background request must not interfere with PBR loading readiness.
  const ready = new HDRLoader(new THREE.LoadingManager()).loadAsync("textures/sky/partly-cloudy.hdr")
    .then((texture) => {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.minFilter = texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      uniforms.uSky.value = texture;
      uniforms.uReady.value = 1;
    }).catch((error: unknown) => {
      // Keep a usable clear sky if this optional image cannot be downloaded.
      console.warn("Sky image unavailable; using the clear-sky fallback.", error);
    });
  return { mesh, ready };
}
