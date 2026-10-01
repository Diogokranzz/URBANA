import * as THREE from '../vendor/three.module.js';

const QUAD_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const BRIGHT_FRAG = `
uniform sampler2D tDiffuse;
uniform float uThreshold;
uniform float uKnee;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float l = max(c.r, max(c.g, c.b));
  float soft = clamp(l - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-4);
  float w = max(soft, l - uThreshold) / max(l, 1e-4);
  gl_FragColor = vec4(c * w, 1.0);
}
`;

const BLUR_FRAG = `
uniform sampler2D tDiffuse;
uniform vec2 uDir;
varying vec2 vUv;
void main() {
  vec3 s = texture2D(tDiffuse, vUv).rgb * 0.2270270270;
  s += texture2D(tDiffuse, vUv + uDir * 1.3846153846).rgb * 0.3162162162;
  s += texture2D(tDiffuse, vUv - uDir * 1.3846153846).rgb * 0.3162162162;
  s += texture2D(tDiffuse, vUv + uDir * 3.2307692308).rgb * 0.0702702703;
  s += texture2D(tDiffuse, vUv - uDir * 3.2307692308).rgb * 0.0702702703;
  gl_FragColor = vec4(s, 1.0);
}
`;

const COMPOSITE_FRAG = `
uniform sampler2D tDiffuse;
uniform sampler2D tBloom;
uniform float uExposure;
uniform float uBloom;
uniform float uChroma;
uniform float uContrast;
uniform float uSat;
uniform float uVignette;
uniform float uGrain;
uniform float uTime;
uniform vec3 uShadowTint;
uniform vec3 uHighlightTint;
uniform vec2 uResolution;
varying vec2 vUv;

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

vec3 paraSrgb(vec3 c) {
  vec3 lo = c * 12.92;
  vec3 hi = pow(max(c, vec3(0.0)), vec3(0.4166667)) * 1.055 - 0.055;
  return mix(hi, lo, step(c, vec3(0.0031308)));
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  vec2 uv = vUv;
  vec2 d = uv - 0.5;
  float r2 = dot(d, d);

  vec2 off = d * uChroma * (0.4 + r2 * 2.4);
  vec3 c = texture2D(tDiffuse, uv).rgb;
  c.r = texture2D(tDiffuse, uv + off).r;
  c.b = texture2D(tDiffuse, uv - off).b;

  c += texture2D(tBloom, uv).rgb * uBloom;
  c *= uExposure;
  c = aces(c);

  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(c * uShadowTint, c * uHighlightTint, smoothstep(0.12, 0.72, l));
  c = (c - 0.5) * uContrast + 0.5;
  float sat = uSat - 0.34 * smoothstep(0.42, 0.95, l);
  c = mix(vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), c, sat);
  c = paraSrgb(max(c, vec3(0.0)));

  float v = 1.0 - smoothstep(0.30, 1.02, length(d) * 1.4);
  c *= mix(1.0, v, uVignette);

  float n = hash(uv * uResolution + fract(uTime) * 91.7) - 0.5;
  c += n * uGrain;
  c += (hash(uv * uResolution * 0.5) - 0.5) / 255.0;

  gl_FragColor = vec4(max(c, vec3(0.0)), 1.0);
}
`;

export class Cinema {
  constructor(renderer, level = 'alta') {
    this.renderer = renderer;
    this.enabled = true;
    this.blurPasses = 2;
    this.blurDown = 0.5;
    this.tone = {
      exposure: 1.32,
      bloom: 0.78,
      chroma: 0.0016,
      contrast: 1.06,
      sat: 1.1,
      vignette: 0.52,
      grain: 0.026,
    };

    const hdr = renderer.capabilities.isWebGL2
      && (renderer.extensions.has('EXT_color_buffer_half_float') || renderer.extensions.has('EXT_color_buffer_float'));
    this.hdr = !!hdr;
    this.type = this.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;

    this.quadScene = new THREE.Scene();
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);

    const rtOpts = {
      type: this.type,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
    };
    this.rtScene = new THREE.WebGLRenderTarget(2, 2, rtOpts);
    this.rtScene.texture.colorSpace = THREE.LinearSRGBColorSpace;
    this.rtBright = new THREE.WebGLRenderTarget(2, 2, { ...rtOpts, depthBuffer: false });
    this.rtBright.texture.colorSpace = THREE.LinearSRGBColorSpace;
    this.rtA = new THREE.WebGLRenderTarget(2, 2, { ...rtOpts, depthBuffer: false });
    this.rtA.texture.colorSpace = THREE.LinearSRGBColorSpace;
    this.rtB = new THREE.WebGLRenderTarget(2, 2, { ...rtOpts, depthBuffer: false });
    this.rtB.texture.colorSpace = THREE.LinearSRGBColorSpace;

    this.brightMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uThreshold: { value: this.hdr ? 0.68 : 0.54 },
        uKnee: { value: 0.42 },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: BRIGHT_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.blurMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } },
      vertexShader: QUAD_VERT,
      fragmentShader: BLUR_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.compositeMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tBloom: { value: null },
        uExposure: { value: 1.15 },
        uBloom: { value: 0.62 },
        uChroma: { value: 0.0016 },
        uContrast: { value: 1.06 },
        uSat: { value: 1.1 },
        uVignette: { value: 0.62 },
        uGrain: { value: 0.028 },
        uTime: { value: 0 },
        uShadowTint: { value: new THREE.Color(0.92, 0.99, 1.07) },
        uHighlightTint: { value: new THREE.Color(1.08, 1.0, 0.92) },
        uResolution: { value: new THREE.Vector2(1280, 720) },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: COMPOSITE_FRAG,
      depthTest: false,
      depthWrite: false,
    });

    this.setLevel(level);
    this.setSize();
  }

  setLevel(level) {
    if (level === 'baixa') {
      this.enabled = false;
      return;
    }
    this.enabled = true;
    const media = level === 'media';
    this.blurPasses = media ? 1 : 2;
    this.tone = {
      exposure: media ? 1.26 : 1.32,
      bloom: media ? 0.62 : 0.78,
      chroma: media ? 0.0011 : 0.0016,
      contrast: 1.06,
      sat: media ? 1.07 : 1.1,
      vignette: 0.52,
      grain: media ? 0.02 : 0.026,
    };
    this.blurDown = media ? 0.34 : 0.5;
  }

  setExposure(v) {
    if (this.tone) this.tone.exposure = v;
  }

  setSize() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const w = Math.max(2, Math.floor(size.x));
    const h = Math.max(2, Math.floor(size.y));
    this.width = w;
    this.height = h;
    this.rtScene.setSize(w, h);
    const bw = Math.max(2, Math.floor(w * (this.blurDown || 0.5)));
    const bh = Math.max(2, Math.floor(h * (this.blurDown || 0.5)));
    this.rtBright.setSize(bw, bh);
    this.rtA.setSize(bw, bh);
    this.rtB.setSize(bw, bh);
    this.compositeMat.uniforms.uResolution.value.set(w, h);
    this.brightMat.uniforms.uThreshold.value = this.hdr ? 0.68 : 0.54;
  }

  blit(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCamera);
  }

  render(scene, camera, overlayScene, overlayCamera) {
    const r = this.renderer;
    if (!this.enabled) {
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.toneMappingExposure = this.tone.exposure;
      r.setRenderTarget(null);
      r.clear();
      r.render(scene, camera);
      if (overlayScene) {
        r.clearDepth();
        r.render(overlayScene, overlayCamera);
      }
      return;
    }

    r.toneMapping = THREE.NoToneMapping;
    r.setRenderTarget(this.rtScene);
    r.clear();
    r.render(scene, camera);
    if (overlayScene) {
      r.clearDepth();
      r.render(overlayScene, overlayCamera);
    }

    this.brightMat.uniforms.tDiffuse.value = this.rtScene.texture;
    this.blit(this.brightMat, this.rtBright);

    const bw = this.rtBright.width, bh = this.rtBright.height;
    let src = this.rtBright;
    for (let i = 0; i < this.blurPasses; i++) {
      const radius = 1 + i * 2.15;
      this.blurMat.uniforms.tDiffuse.value = src.texture;
      this.blurMat.uniforms.uDir.value.set(radius / bw, 0);
      this.blit(this.blurMat, this.rtA);
      this.blurMat.uniforms.tDiffuse.value = this.rtA.texture;
      this.blurMat.uniforms.uDir.value.set(0, radius / bh);
      this.blit(this.blurMat, this.rtB);
      src = this.rtB;
    }

    const u = this.compositeMat.uniforms;
    u.tDiffuse.value = this.rtScene.texture;
    u.tBloom.value = src.texture;
    u.uTime.value = performance.now() * 0.001;
    u.uExposure.value = this.tone.exposure;
    u.uBloom.value = this.tone.bloom;
    u.uChroma.value = this.tone.chroma;
    u.uContrast.value = this.tone.contrast;
    u.uSat.value = this.tone.sat;
    u.uVignette.value = this.tone.vignette;
    u.uGrain.value = this.tone.grain;
    this.blit(this.compositeMat, null);
    r.setRenderTarget(null);
  }
}
