<template>
  <main class="black-hole-stage">
    <button
      v-if="panelHidden"
      type="button"
      class="panel-toggle show-panel"
      aria-label="Show controls"
      @click="panelHidden = false"
    >
      Controls
    </button>
    <section v-show="!panelHidden" class="control-panel" :class="{ busy }" :style="panelColors" aria-label="Black hole controls">
      <button
        type="button"
        class="panel-toggle hide-panel"
        aria-label="Hide controls"
        title="Hide controls"
        @click="panelHidden = true"
      >
        ×
      </button>
      <label>
        <input v-model="spinEnabled" type="checkbox" :disabled="controlsDisabled">
        Spin accretion disk
      </label>
      <label class="mass-control">
        Mass
        <input v-model.number="mass" type="range" min="0.35" max="1.5" step="0.05" :disabled="controlsDisabled">
        <output>{{ Math.round(mass * 100) }}%</output>
      </label>
      <label class="radius-control">
        Bloom
        <input v-model.number="bloom" type="range" min="0" max="2" step="0.05" :disabled="controlsDisabled">
        <output>{{ bloom.toFixed(2) }}</output>
      </label>
      <label class="speed-control">
        Speed
        <input v-model.number="speed" type="range" min="0" max="5" step="0.1" :disabled="controlsDisabled">
      </label>
      <label class="temperature-control">
        Temperature
        <input v-model.number="temperature" type="range" min="0" max="1" step="0.01" :disabled="controlsDisabled">
      </label>
      <label class="radius-control">
        Brightness
        <input v-model.number="brightness" type="range" min="0" max="3" step="0.1" :disabled="controlsDisabled">
        <output>{{ brightness.toFixed(1) }}</output>
      </label>
      <label class="radius-control">
        Roll
        <input v-model.number="roll" type="range" min="-180" max="180" step="0.5" :disabled="controlsDisabled">
        <output>{{ roll.toFixed(1) }}°</output>
      </label>
      <label class="radius-control">
        Pitch
        <input v-model.number="pitch" type="range" min="0" max="89" step="1" :disabled="controlsDisabled">
        <output>{{ pitch }}°</output>
      </label>
      <label class="radius-control">
        Yaw
        <input v-model.number="yaw" type="range" min="-90" max="90" step="1" :disabled="controlsDisabled">
        <output>{{ yaw }}°</output>
      </label>
      <label class="radius-control">
        Detail
        <input v-model.number="detail" type="range" min="1" max="12" step="0.5" :disabled="controlsDisabled" @change="rebuildDiskTexture">
        <output>{{ detail.toFixed(1) }}</output>
      </label>
      <label class="radius-control">
        Contrast
        <input v-model.number="contrast" type="range" min="0.5" max="3" step="0.1" :disabled="controlsDisabled" @change="rebuildDiskTexture">
        <output>{{ contrast.toFixed(1) }}</output>
      </label>
      <label class="radius-control">
        R in
        <input v-model.number="rIn" type="range" min="2.5" max="6" step="0.1" :disabled="controlsDisabled">
        <output>{{ rIn.toFixed(1) }}</output>
      </label>
      <label class="radius-control">
        R out
        <input v-model.number="rOut" type="range" min="18" max="88" step="1" :disabled="controlsDisabled">
        <output>{{ rOut }}</output>
      </label>
      <div class="button-row">
        <button type="button" class="reset-button" :disabled="controlsDisabled" @click="centerHole">
          Center
        </button>
        <button type="button" class="reset-button" :disabled="controlsDisabled" @click="resetControls">
          Reset
        </button>
      </div>
      <span v-if="status" role="status">{{ status }}</span>
    </section>
    <canvas
      ref="canvas"
      class="black-hole-canvas"
      :width="WIDTH"
      :height="HEIGHT"
      aria-label="Spinning ray-traced black hole and accretion disk"
    />
    <aside class="info-box" :class="{ open: infoOpen }" aria-label="About this render">
      <button
        type="button"
        class="info-toggle"
        :aria-expanded="infoOpen"
        :aria-label="infoOpen ? 'Hide information' : 'Show information'"
        :title="infoOpen ? 'Hide information' : 'How this is made'"
        @click="infoOpen = !infoOpen"
      >
        {{ infoOpen ? '×' : '!' }}
      </button>
      <div v-show="infoOpen" class="info-content">
      <h2>How this is made</h2>
      <p>
        Nothing here is a video or a 3D model. Every pixel fires a light ray backwards from the
        camera and bends it through the curved space around a non-rotating (Schwarzschild) black
        hole, using a numerical solver (RK4) running in a WebGL2 shader on your GPU.
      </p>
      <p>
        Where a ray crosses the accretion disk plane, it picks up the disk's colour and
        brightness. Rays can cross more than once, which gives the glowing arc that appears
        over the top and under the hole (the far side of the disk, bent into view).
      </p>
      <p>
        The disk is a procedural noise texture, sheared so the inside orbits faster than the
        outside. Doppler shift and gravitational redshift make the approaching side brighter and
        the colours shift. A final bloom pass adds the glow.
      </p>
      <p>
        Copyright 2026 Paul Rid<template v-if="contact">
          (<a :href="`mailto:${contact}`">{{ contact }}</a>)</template>.
      </p>
      </div>
    </aside>
  </main>
</template>

<script setup>
const WIDTH = 1280
const HEIGHT = 720
const R_IN_MIN = 2.5
const R_OUT_MAX = 88
const BASE_SHADOW_PX = 122 / 736 * WIDTH
const CX = 580 / 736 * WIDTH
const CY = 110 / 414 * HEIGHT
const ROLL_SNAP = 2
const MAX_INCL = 89 * Math.PI / 180
const SPIN_RATE = 0.5
// Max shear (radians between inner and outer disk) before the texture is cross-faded back
const SHEAR_CYCLE = 2 * Math.PI
const SHEAR = 1.0
const TAU = 2 * Math.PI
const STOPS = [
  [0, 0, 0, 0], [0.18, 46, 22, 11], [0.42, 150, 76, 30],
  [0.66, 238, 150, 72], [0.86, 255, 215, 160], [1.05, 255, 250, 240],
]
const BLUE_STOPS = [
  [0,0, 0, 0], [0.18, 12, 28, 60], [0.42, 40, 100, 190],
  [0.66, 120, 180, 240], [0.86, 205, 230, 255], [1.05, 250, 253, 255],
]
const LUT_MAX = 1.05
const TEXTURE_ANGLES = 1536
const TEXTURE_RADII = 1024
const TEX_MIN = R_IN_MIN - 0.2
const TEX_STEP = (R_OUT_MAX - TEX_MIN) / (TEXTURE_RADII - 1)
const MAX_CROSSINGS = 3
const STEP_FAR = 0.06
const STEP_NEAR = 0.03
const BLOOM_LODS = [Math.log2(6), Math.log2(20), Math.log2(10)]

const canvas = ref(null)
const DEFAULTS = {
  bloom: 1,
  spinEnabled: true,
  speed: 1,
  mass: 1,
  temperature: 0,
  brightness: 1.3,
  roll: 15.5,
  pitch: 84,
  yaw: 0,
  detail: 8,
  contrast: 1.4,
  rIn: 4.4,
  rOut: 48,
}

const bloom = ref(DEFAULTS.bloom)
const spinEnabled = ref(DEFAULTS.spinEnabled)
const speed = ref(DEFAULTS.speed)
const mass = ref(DEFAULTS.mass)
const temperature = ref(DEFAULTS.temperature)
const brightness = ref(DEFAULTS.brightness)
const roll = ref(DEFAULTS.roll)
const pitch = ref(DEFAULTS.pitch)
const yaw = ref(DEFAULTS.yaw)
const detail = ref(DEFAULTS.detail)
const contrast = ref(DEFAULTS.contrast)
const rIn = ref(DEFAULTS.rIn)
const rOut = ref(DEFAULTS.rOut)
const panelHidden = ref(true)
const infoOpen = ref(false)
const busy = ref(true)
const controlsDisabled = ref(true)
const status = ref('Computing…')

let gl
let vao
let diskTexture
let builtTexture
let traceTextures = []
let traceFramebuffer
let sceneTexture
let sceneFramebuffer
let traceProgram
let shadeProgram
let compositeProgram
let frame = 0
let timer = 0
let fixedTime = null
let lastFrameTime = 0
let spinTime = 0
let shadowPx = BASE_SHADOW_PX
let centerX = CX
let centerY = CY
let unit = shadowPx / 5.196
let needsTrace = true
let dirty = true
let mounted = false

// The address is only assembled client-side once the info box is opened, so it
// is never in the served HTML or the bundle as a literal string.
const contact = ref('')
watch(infoOpen, (open) => {
  if (open && !contact.value) contact.value = ['paul.s.rid', 'pm.me'].join(String.fromCharCode(64))
})

// Panel colours follow the disk palette: the 0.66 stop for the accent, the 0.86 stop for text
const stopColor = (warm, cool) => `rgb(${warm.map((v, i) => Math.round(v + (cool[i] - v) * temperature.value)).join(', ')})`
const panelColors = computed(() => ({
  '--panel-accent': stopColor(STOPS[3].slice(1), BLUE_STOPS[3].slice(1)),
  '--panel-ink': stopColor(STOPS[4].slice(1), BLUE_STOPS[4].slice(1)),
}))

watch([bloom, spinEnabled, speed, temperature, brightness], () => {
  dirty = true
})

watch(mass, () => {
  shadowPx = BASE_SHADOW_PX * mass.value
  unit = shadowPx / 5.196
  needsTrace = true
  dirty = true
})

watch(roll, (value) => {
  if (value !== 0 && Math.abs(value) <= ROLL_SNAP) roll.value = 0
})

watch([rIn, rOut, roll, pitch, yaw], () => {
  needsTrace = true
  dirty = true
})

const f = (value) => (Number.isInteger(value) ? value.toFixed(1) : String(value))
const vec3List = (stops) => stops
  .map(stop => `vec3(${f(stop[1] / 255)}, ${f(stop[2] / 255)}, ${f(stop[3] / 255)})`)
  .join(', ')

const SHADER_HEAD = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
const float PI = ${f(Math.PI)};
const float TAU = ${f(TAU)};
const float W = ${f(WIDTH)};
const float H = ${f(HEIGHT)};
uniform vec2 uCenter;
#define CX uCenter.x
#define CY uCenter.y
const float TEX_MIN = ${f(TEX_MIN)};
const float TEX_STEP = ${f(TEX_STEP)};
const float TEXTURE_RADII = ${f(TEXTURE_RADII)};
const float TEXTURE_ANGLES = ${f(TEXTURE_ANGLES)};
const float SHEAR = ${f(SHEAR)};
uniform float uTilt;
vec2 pixelCoord() {
  return vec2(gl_FragCoord.x - 0.5, H - 0.5 - gl_FragCoord.y);
}
vec2 rayCoord(vec2 pix, float unitPx) {
  float screenX = (pix.x - CX) / unitPx;
  float screenY = -(pix.y - CY) / unitPx;
  float sinTilt = sin(uTilt);
  float cosTilt = cos(uTilt);
  return vec2(screenX * cosTilt + screenY * sinTilt, -screenX * sinTilt + screenY * cosTilt);
}
`

const VERTEX_SOURCE = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`

const TRACE_SOURCE = `${SHADER_HEAD}
const float STEP_FAR = ${f(STEP_FAR)};
const float STEP_NEAR = ${f(STEP_NEAR)};
const float CD_F = ${f(Math.cos(STEP_FAR))};
const float SD_F = ${f(Math.sin(STEP_FAR))};
const float CD_N = ${f(Math.cos(STEP_NEAR))};
const float SD_N = ${f(Math.sin(STEP_NEAR))};
uniform float uUnit;
uniform float uRIn;
uniform float uROut;
uniform float uIncl;
layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;
layout(location = 2) out vec4 o2;
layout(location = 3) out vec4 o3;

float gData[16];
int gCount = 0;
float SIN_INCL = 0.0;
float COS_INCL = 1.0;

void record(float radius, float angle) {
  float edge = smoothstep(uRIn, uRIn + 0.7, radius)
    * (1.0 - smoothstep(uROut * 0.35, uROut, radius));
  if (edge <= 0.001) return;

  float intensity = pow(uRIn / radius, 2.1);
  float velocity = min(0.6, 1.0 / sqrt(radius - 2.0));
  float gamma = 1.0 / sqrt(1.0 - velocity * velocity);
  float velocityAlongSight = -velocity * sin(angle) * SIN_INCL;
  float redshift = sqrt(1.0 - 2.0 / radius) / (gamma * (1.0 - velocityAlongSight));
  float textureAngle = angle;
  textureAngle -= TAU * floor((textureAngle + PI) / TAU);
  int base = gCount * 5;

  gData[base] = clamp((radius - TEX_MIN) / TEX_STEP, 0.0, TEXTURE_RADII - 1.001);
  gData[base + 1] = textureAngle;
  gData[base + 2] = pow(uRIn / radius, SHEAR);
  gData[base + 3] = intensity * pow(redshift, 2.6) * edge;
  gData[base + 4] = edge;
  gCount += 1;
}

void traceRay(vec2 p) {
  float impact = length(p);
  if (impact < 1e-3) return;

  float e2x = -p.y * COS_INCL / impact;
  float e2y = p.x / impact;
  float e2z = p.y * SIN_INCL / impact;
  float u = 0.0;
  float v = 1.0 / impact;
  float cosPhi = 1.0;
  float sinPhi = 0.0;
  float previousPlane = COS_INCL;

  for (int iter = 0; iter < 420; iter += 1) {
    bool farField = u < 0.035;
    float h = farField ? STEP_FAR : STEP_NEAR;
    float k1u = v;
    float k1v = -u + 3.0 * u * u;
    float u2 = u + 0.5 * h * k1u;
    float v2 = v + 0.5 * h * k1v;
    float k2u = v2;
    float k2v = -u2 + 3.0 * u2 * u2;
    float u3 = u + 0.5 * h * k2u;
    float v3 = v + 0.5 * h * k2v;
    float k3u = v3;
    float k3v = -u3 + 3.0 * u3 * u3;
    float u4 = u + h * k3u;
    float v4 = v + h * k3v;
    float k4u = v4;
    float k4v = -u4 + 3.0 * u4 * u4;
    float nextU = u + h / 6.0 * (k1u + 2.0 * k2u + 2.0 * k3u + k4u);
    float nextV = v + h / 6.0 * (k1v + 2.0 * k2v + 2.0 * k3v + k4v);
    float cosDelta = farField ? CD_F : CD_N;
    float sinDelta = farField ? SD_F : SD_N;
    float nextCosPhi = cosPhi * cosDelta - sinPhi * sinDelta;
    float nextSinPhi = sinPhi * cosDelta + cosPhi * sinDelta;
    float nextPlane = nextCosPhi * COS_INCL + nextSinPhi * e2z;

    if (previousPlane * nextPlane < 0.0) {
      float fraction = previousPlane / (previousPlane - nextPlane);
      float crossingU = u + fraction * (nextU - u);
      if (crossingU > 0.0) {
        float radius = 1.0 / crossingU;
        if (radius > uRIn - 0.2 && radius < uROut) {
          float crossingCos = cosPhi + fraction * (nextCosPhi - cosPhi);
          float crossingSin = sinPhi + fraction * (nextSinPhi - sinPhi);
          float px = radius * (crossingCos * SIN_INCL + crossingSin * e2x);
          float py = radius * crossingSin * e2y;
          record(radius, atan(py, px));
          if (gCount >= ${MAX_CROSSINGS}) return;
        }
      }
    }

    if (nextU >= 0.5 || nextU <= 0.0) return;
    u = nextU;
    v = nextV;
    cosPhi = nextCosPhi;
    sinPhi = nextSinPhi;
    previousPlane = nextPlane;
  }
}

void main() {
  for (int i = 0; i < 16; i += 1) gData[i] = 0.0;
  SIN_INCL = sin(uIncl);
  COS_INCL = cos(uIncl);
  traceRay(rayCoord(pixelCoord(), uUnit));
  o0 = vec4(gData[0], gData[1], gData[2], gData[3]);
  o1 = vec4(gData[4], gData[5], gData[6], gData[7]);
  o2 = vec4(gData[8], gData[9], gData[10], gData[11]);
  o3 = vec4(gData[12], gData[13], gData[14], gData[15]);
}
`

const SHADE_SOURCE = `${SHADER_HEAD}
const float STOP_T[6] = float[6](${STOPS.map(stop => f(stop[0])).join(', ')});
const vec3 WARM[6] = vec3[6](${vec3List(STOPS)});
const vec3 COOL[6] = vec3[6](${vec3List(BLUE_STOPS)});
uniform sampler2D uTrace0;
uniform sampler2D uTrace1;
uniform sampler2D uTrace2;
uniform sampler2D uTrace3;
uniform sampler2D uDisk;
uniform float uUnit;
uniform float uShadowPx;
uniform float uPhaseA;
uniform float uPhaseB;
uniform float uMixA;
uniform float uTemperature;
uniform float uBrightness;
out vec4 outColor;

vec3 palette(float value) {
  value = clamp(value, 0.0, ${f(LUT_MAX)});
  int s = 0;
  for (int i = 0; i < 4; i += 1) {
    if (value > STOP_T[i + 1]) s = i + 1;
  }
  float t = clamp((value - STOP_T[s]) / (STOP_T[s + 1] - STOP_T[s]), 0.0, 1.0);
  return mix(mix(WARM[s], WARM[s + 1], t), mix(COOL[s], COOL[s + 1], t), uTemperature);
}

void loadTrace(ivec2 p, out float g[16]) {
  vec4 a = texelFetch(uTrace0, p, 0);
  vec4 b = texelFetch(uTrace1, p, 0);
  vec4 c = texelFetch(uTrace2, p, 0);
  vec4 d = texelFetch(uTrace3, p, 0);
  g = float[16](
    a.x, a.y, a.z, a.w, b.x, b.y, b.z, b.w, c.x, c.y, c.z, c.w, d.x, d.y, d.z, d.w
  );
}

float wrapDelta(float delta) {
  return delta - TAU * floor(delta / TAU + 0.5);
}

void main() {
  ivec2 ip = ivec2(gl_FragCoord.xy);
  ivec2 maxP = ivec2(int(W) - 1, int(H) - 1);
  float g[16];
  float gx[16];
  float gy[16];
  loadTrace(ip, g);
  loadTrace(min(ip + ivec2(1, 0), maxP), gx);
  loadTrace(min(ip + ivec2(0, 1), maxP), gy);

  float light = 0.0;
  float transmittance = 1.0;
  for (int i = 0; i < ${MAX_CROSSINGS}; i += 1) {
    int k = i * 5;
    float edge = g[k + 4];
    if (edge <= 0.0) continue;
    // Differential rotation shears the texture without bound, so it is sampled
    // at two phases that each wrap every cycle and are cross-faded; each layer
    // has zero weight at the moment it resets.
    vec2 disk = vec2(0.0);
    for (int layer = 0; layer < 2; layer += 1) {
      float phase = layer == 0 ? uPhaseA : uPhaseB;
      float layerWeight = layer == 0 ? uMixA : 1.0 - uMixA;
      float angle = g[k + 1] - g[k + 2] * phase;
      angle -= TAU * floor((angle + PI) / TAU);
      vec2 uv = vec2((angle + PI) / TAU + 0.5 / TEXTURE_ANGLES, (g[k] + 0.5) / TEXTURE_RADII);

      // Screen-space texture gradients from the neighbouring rays, so the disk
      // texture is mip/anisotropically filtered instead of aliasing into moire.
      vec2 duvX = vec2(0.0);
      vec2 duvY = vec2(0.0);
      if (gx[k + 4] > 0.0) {
        float da = wrapDelta(gx[k + 1] - g[k + 1]) - (gx[k + 2] - g[k + 2]) * phase;
        duvX = vec2(da / TAU, (gx[k] - g[k]) / TEXTURE_RADII);
      }
      if (gy[k + 4] > 0.0) {
        float da = wrapDelta(gy[k + 1] - g[k + 1]) - (gy[k + 2] - g[k + 2]) * phase;
        duvY = vec2(da / TAU, (gy[k] - g[k]) / TEXTURE_RADII);
      }
      duvX = clamp(duvX, vec2(-0.04), vec2(0.04));
      duvY = clamp(duvY, vec2(-0.04), vec2(0.04));
      disk += layerWeight * textureGrad(uDisk, uv, duvX, duvY).rg;
    }
    float opacity = disk.g * edge;
    light += transmittance * opacity * g[i * 5 + 3] * disk.r;
    transmittance *= 1.0 - opacity;
    if (transmittance < 0.02) break;
  }

  vec2 pix = pixelCoord();
  vec2 ray = rayCoord(pix, uUnit);
  float screenAngle = atan(-(pix.y - CY), pix.x - CX);
  float ringDistance = (length(ray) - 5.22) / 0.055;
  float lobe = 0.5 + 0.5 * cos(screenAngle - 2.6);
  float added = 0.8 * exp(-ringDistance * ringDistance) * (0.08 + 0.92 * lobe * lobe);
  float shadowDistance = length(pix - vec2(CX, CY));
  added += 0.012 + 0.05 * exp(-shadowDistance / (uShadowPx * 2.0))
    * (shadowDistance > uShadowPx ? 1.0 : 0.1);
  float vignetteX = max(0.0, (W * 0.4 - pix.x) / (W * 0.4));
  float vignetteY = max(0.0, (pix.y - H * 0.8) / (H * 0.4));
  float vignette = 1.0 - 0.5 * clamp(vignetteX * 0.8 + vignetteY, 0.0, 1.0);

  light = (light * uBrightness + added) * vignette;
  outColor = vec4(palette(light), 1.0);
}
`

const COMPOSITE_SOURCE = `${SHADER_HEAD}
uniform sampler2D uScene;
uniform float uBloom;
uniform float uShadowPx;
out vec4 outColor;

vec3 blurLod(vec2 uv, float lod) {
  vec2 texel = exp2(lod) / vec2(W, H);
  vec3 sum = vec3(0.0);
  for (int x = -1; x <= 1; x += 1) {
    for (int y = -1; y <= 1; y += 1) {
      float weight = (x == 0 ? 2.0 : 1.0) * (y == 0 ? 2.0 : 1.0);
      sum += weight * textureLod(uScene, uv + vec2(float(x), float(y)) * texel, lod).rgb;
    }
  }
  return sum / 16.0;
}

void main() {
  vec2 uv = gl_FragCoord.xy / vec2(W, H);
  vec3 color = textureLod(uScene, uv, 0.0).rgb;
  if (uBloom > 0.0) {
    color += uBloom * 0.45 * blurLod(uv, ${f(BLOOM_LODS[0])});
    color += uBloom * 0.55 * blurLod(uv, ${f(BLOOM_LODS[1])});
    float t = length(pixelCoord() - vec2(CX, CY + uShadowPx * 0.95)) / (uShadowPx * 1.5);
    float mask = t < 0.5 ? 1.0 - 0.8 * t : max(0.0, 0.6 - 1.2 * (t - 0.5));
    color += uBloom * 4.0 * mask * blurLod(uv, ${f(BLOOM_LODS[2])});
  }
  float n1 = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float n2 = fract(sin(dot(gl_FragCoord.xy + vec2(19.19, 7.7), vec2(12.9898, 78.233))) * 43758.5453);
  color += (n1 + n2 - 1.0) / 255.0;
  outColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`

onMounted(() => {
  const node = canvas.value
  if (!node) return
  gl = node.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: true,
  })
  if (!gl || !gl.getExtension('EXT_color_buffer_float')) {
    busy.value = false
    status.value = 'WebGL2 with float render targets is required.'
    return
  }

  const parameters = new URLSearchParams(window.location.search)
  if (parameters.has('t')) {
    const requestedTime = Number.parseFloat(parameters.get('t'))
    fixedTime = Number.isFinite(requestedTime) ? requestedTime : 0
  }
  spinTime = fixedTime ?? 0
  mounted = true

  timer = window.setTimeout(() => {
    try {
      initGpu()
    } catch (error) {
      console.error(error)
      busy.value = false
      status.value = 'Could not start the GPU renderer.'
      return
    }
    status.value = ''
    busy.value = false
    drawFrame()
    window.__done = true
    if (fixedTime !== null) return
    controlsDisabled.value = false
    frame = window.requestAnimationFrame((time) => {
      lastFrameTime = time
      tick(time)
    })
  }, 30)
})

onBeforeUnmount(() => {
  mounted = false
  window.clearTimeout(timer)
  window.cancelAnimationFrame(frame)
  gl?.getExtension('WEBGL_lose_context')?.loseContext()
})

function resetControls() {
  bloom.value = DEFAULTS.bloom
  spinEnabled.value = DEFAULTS.spinEnabled
  speed.value = DEFAULTS.speed
  mass.value = DEFAULTS.mass
  temperature.value = DEFAULTS.temperature
  brightness.value = DEFAULTS.brightness
  roll.value = DEFAULTS.roll
  pitch.value = DEFAULTS.pitch
  yaw.value = DEFAULTS.yaw
  detail.value = DEFAULTS.detail
  contrast.value = DEFAULTS.contrast
  rIn.value = DEFAULTS.rIn
  rOut.value = DEFAULTS.rOut
  moveHole(CX, CY)
  rebuildDiskTexture()
}

// The lensing is spherically symmetric, so only the disk normal relative to
// the line of sight matters. Pitch tips the normal toward the viewer, yaw
// swings it left/right, and roll rotates the result around the view axis.
// Reduce that to the inclination and screen tilt the shaders understand.
function viewAngles() {
  const pitchRad = pitch.value * Math.PI / 180
  const yawRad = yaw.value * Math.PI / 180
  const normalX = Math.cos(pitchRad) * Math.sin(yawRad)
  const normalY = Math.sin(pitchRad)
  const normalZ = Math.cos(pitchRad) * Math.cos(yawRad)
  return {
    incl: Math.min(Math.acos(clamp(normalZ, -1, 1)), MAX_INCL),
    tilt: Math.atan2(-normalX, normalY) + roll.value * Math.PI / 180,
  }
}

function moveHole(x, y) {
  centerX = x
  centerY = y
  needsTrace = true
  dirty = true
}

function centerHole() {
  moveHole(WIDTH / 2, HEIGHT / 2)
}

function hash(x, y) {
  let value = x * 374761393 + y * 668265263
  value = (value ^ (value >>> 13)) * 1274126177
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295
}

function valueNoise(x, y) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const a = hash(xi, yi)
  const b = hash(xi + 1, yi)
  const c = hash(xi, yi + 1)
  const d = hash(xi + 1, yi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

function fbm(x, y) {
  let sum = 0
  let amplitude = 0.5
  for (let i = 0; i < 5; i += 1) {
    sum += amplitude * valueNoise(x, y)
    x = x * 2.03 + 11.7
    y = y * 2.03 + 3.1
    amplitude *= 0.5
  }
  return sum
}

function periodicFbm(angle, frequency, radius) {
  const weight = (angle + Math.PI) / TAU
  return fbm(angle * frequency, radius) * (1 - weight)
    + fbm((angle - TAU) * frequency, radius) * weight
}

function periodicNoise(angle, frequency, radius) {
  const weight = (angle + Math.PI) / TAU
  return valueNoise(angle * frequency, radius) * (1 - weight)
    + valueNoise((angle - TAU) * frequency, radius) * weight
}

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value))
}

function buildDiskTexture(detail, contrast) {
  const data = new Float32Array(TEXTURE_ANGLES * TEXTURE_RADII * 2)
  for (let radiusIndex = 0; radiusIndex < TEXTURE_RADII; radiusIndex += 1) {
    const radius = TEX_MIN + radiusIndex * TEX_STEP
    for (let angleIndex = 0; angleIndex < TEXTURE_ANGLES; angleIndex += 1) {
      const angle = -Math.PI + angleIndex * TAU / TEXTURE_ANGLES
      const density = clamp(periodicFbm(angle, detail, radius * 0.9) * 1.9, 0, 1.4)
      const grain = periodicNoise(angle, 16, radius * 3)
      const index = (radiusIndex * TEXTURE_ANGLES + angleIndex) * 2
      data[index] = (0.12 + 1.5 * density ** contrast) * (0.7 + 0.6 * grain)
      data[index + 1] = clamp(0.1 + 0.8 * density, 0, 0.9)
    }
  }
  return data
}

function compileShader(type, source) {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || 'Shader compile failed')
  }
  return shader
}

function createProgram(fragmentSource) {
  const program = gl.createProgram()
  gl.attachShader(program, compileShader(gl.VERTEX_SHADER, VERTEX_SOURCE))
  gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, fragmentSource))
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || 'Program link failed')
  }
  const uniforms = {}
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS)
  for (let index = 0; index < count; index += 1) {
    const name = gl.getActiveUniform(program, index).name
    uniforms[name] = gl.getUniformLocation(program, name)
  }
  return { program, uniforms }
}

function createTexture(internalFormat, format, type, data, filter, mipmaps = false) {
  const texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texture)
  const width = data ? TEXTURE_ANGLES : WIDTH
  const height = data ? TEXTURE_RADII : HEIGHT
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, data ?? null)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mipmaps ? gl.LINEAR_MIPMAP_LINEAR : filter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, data ? gl.REPEAT : gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return texture
}

function createDiskTexture() {
  builtTexture = { detail: detail.value, contrast: contrast.value }
  const data = buildDiskTexture(detail.value, contrast.value)
  const texture = createTexture(gl.RG16F, gl.RG, gl.FLOAT, data, gl.LINEAR, true)
  gl.generateMipmap(gl.TEXTURE_2D)
  const anisotropic = gl.getExtension('EXT_texture_filter_anisotropic')
  if (anisotropic) {
    const maxAnisotropy = gl.getParameter(anisotropic.MAX_TEXTURE_MAX_ANISOTROPY_EXT)
    gl.texParameterf(gl.TEXTURE_2D, anisotropic.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(16, maxAnisotropy))
  }
  return texture
}

function rebuildDiskTexture() {
  if (!gl || busy.value) return
  if (builtTexture.detail === detail.value
    && builtTexture.contrast === contrast.value) return
  busy.value = true
  controlsDisabled.value = true
  status.value = 'Computing…'
  window.setTimeout(() => {
    if (!mounted) return
    gl.deleteTexture(diskTexture)
    diskTexture = createDiskTexture()
    status.value = ''
    busy.value = false
    controlsDisabled.value = false
    dirty = true
  }, 30)
}

function checkFramebuffer(name) {
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error(`${name} framebuffer is incomplete`)
  }
}

function initGpu() {
  vao = gl.createVertexArray()
  gl.bindVertexArray(vao)
  gl.disable(gl.DEPTH_TEST)
  gl.disable(gl.BLEND)

  traceProgram = createProgram(TRACE_SOURCE)
  shadeProgram = createProgram(SHADE_SOURCE)
  compositeProgram = createProgram(COMPOSITE_SOURCE)

  diskTexture = createDiskTexture()

  traceFramebuffer = gl.createFramebuffer()
  gl.bindFramebuffer(gl.FRAMEBUFFER, traceFramebuffer)
  const attachments = []
  for (let index = 0; index < 4; index += 1) {
    const texture = createTexture(gl.RGBA32F, gl.RGBA, gl.FLOAT, null, gl.NEAREST)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + index, gl.TEXTURE_2D, texture, 0)
    traceTextures.push(texture)
    attachments.push(gl.COLOR_ATTACHMENT0 + index)
  }
  gl.drawBuffers(attachments)
  checkFramebuffer('Trace')

  sceneTexture = createTexture(gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, null, gl.LINEAR, true)
  sceneFramebuffer = gl.createFramebuffer()
  gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFramebuffer)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sceneTexture, 0)
  checkFramebuffer('Scene')
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
}

function bindTexture(slot, texture) {
  gl.activeTexture(gl.TEXTURE0 + slot)
  gl.bindTexture(gl.TEXTURE_2D, texture)
}

function drawPass(framebuffer) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
  gl.viewport(0, 0, WIDTH, HEIGHT)
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

function traceRays() {
  gl.useProgram(traceProgram.program)
  gl.uniform2f(traceProgram.uniforms.uCenter, centerX, centerY)
  const view = viewAngles()
  gl.uniform1f(traceProgram.uniforms.uTilt, view.tilt)
  gl.uniform1f(traceProgram.uniforms.uIncl, view.incl)
  gl.uniform1f(traceProgram.uniforms.uUnit, unit)
  gl.uniform1f(traceProgram.uniforms.uRIn, rIn.value)
  gl.uniform1f(traceProgram.uniforms.uROut, rOut.value)
  drawPass(traceFramebuffer)
}

function shadeScene() {
  const { program, uniforms } = shadeProgram
  gl.useProgram(program)
  traceTextures.forEach((texture, index) => {
    bindTexture(index, texture)
    gl.uniform1i(uniforms[`uTrace${index}`], index)
  })
  bindTexture(4, diskTexture)
  gl.uniform1i(uniforms.uDisk, 4)
  gl.uniform2f(uniforms.uCenter, centerX, centerY)
  gl.uniform1f(uniforms.uTilt, viewAngles().tilt)
  gl.uniform1f(uniforms.uUnit, unit)
  gl.uniform1f(uniforms.uShadowPx, shadowPx)
  const cycle = (spinTime * SPIN_RATE) / SHEAR_CYCLE
  const cycleA = cycle - Math.floor(cycle)
  const cycleB = (cycle + 0.5) - Math.floor(cycle + 0.5)
  gl.uniform1f(uniforms.uPhaseA, cycleA * SHEAR_CYCLE)
  gl.uniform1f(uniforms.uPhaseB, cycleB * SHEAR_CYCLE)
  gl.uniform1f(uniforms.uMixA, Math.sin(Math.PI * cycleA) ** 2)
  gl.uniform1f(uniforms.uTemperature, temperature.value)
  gl.uniform1f(uniforms.uBrightness, brightness.value)
  drawPass(sceneFramebuffer)
  bindTexture(0, sceneTexture)
  gl.generateMipmap(gl.TEXTURE_2D)
}

function compositeScene() {
  const { program, uniforms } = compositeProgram
  gl.useProgram(program)
  bindTexture(0, sceneTexture)
  gl.uniform1i(uniforms.uScene, 0)
  gl.uniform2f(uniforms.uCenter, centerX, centerY)
  gl.uniform1f(uniforms.uBloom, bloom.value)
  gl.uniform1f(uniforms.uShadowPx, shadowPx)
  drawPass(null)
}

function drawFrame() {
  if (needsTrace) {
    traceRays()
    needsTrace = false
  }
  shadeScene()
  compositeScene()
}

function tick(now) {
  if (!mounted) return
  const delta = Math.min(0.1, (now - lastFrameTime) / 1000)
  lastFrameTime = now
  const spinning = spinEnabled.value && speed.value > 0
  if (spinning) spinTime += delta * speed.value
  if (spinning || dirty) {
    drawFrame()
    dirty = false
  }
  frame = window.requestAnimationFrame(tick)
}
</script>

<style>
:root {
  color: #e8d6c0;
  background: #050302;
  font-family: ui-sans-serif, system-ui, sans-serif;
}

* {
  box-sizing: border-box;
}

html,
body,
#__nuxt {
  width: 100%;
  min-width: 320px;
  min-height: 100%;
  margin: 0;
  overflow: hidden;
  background: #050302;
}

.black-hole-stage {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #050302;
}

.black-hole-canvas {
  display: block;
  width: 100vw;
  height: 100vh;
  object-fit: cover;
}

@media (max-aspect-ratio: 1/1) {
  .black-hole-canvas {
    object-position: 90% center;
  }
}

.control-panel {
  position: fixed;
  bottom: 12px;
  left: 12px;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 6px;
  opacity: 0.5;
  background: rgba(0, 0, 0, 0.1);
  color: var(--panel-ink, #e8d6c0);
  font: 13px ui-sans-serif, system-ui, sans-serif;
  user-select: none;
  accent-color: var(--panel-accent, #ee9648);
}

.control-panel label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.control-panel .speed-control,
.control-panel .temperature-control,
.control-panel .radius-control,
.control-panel .mass-control {
  display: grid;
  grid-template-columns: 76px 110px 40px;
}

.control-panel .speed-control input,
.control-panel .temperature-control input,
.control-panel .radius-control input,
.control-panel .mass-control input {
  width: 100%;
  margin: 0;
}

.control-panel .radius-control output,
.control-panel .mass-control output {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.control-panel .button-row {
  display: flex;
  gap: 6px;
}

.control-panel .reset-button {
  padding: 3px 10px;
  border: 1px solid color-mix(in srgb, currentColor 40%, transparent);
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.control-panel .reset-button:disabled {
  cursor: default;
  opacity: 0.5;
}

.info-box {
  position: fixed;
  right: 12px;
  bottom: 12px;
  z-index: 1;
  color: #e8d6c0;
  font: 12px/1.45 ui-sans-serif, system-ui, sans-serif;
}

.info-box.open {
  max-width: 300px;
  padding: 8px 12px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.55);
}

.info-toggle {
  display: block;
  padding: 3px 10px;
  border: 1px solid rgba(232, 214, 192, 0.4);
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.55);
  color: #e8d6c0;
  font: 13px ui-sans-serif, system-ui, sans-serif;
  cursor: pointer;
}

.info-box.open .info-toggle {
  position: absolute;
  top: 6px;
  right: 8px;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  background: transparent;
  line-height: 1;
}

.info-box h2 {
  margin: 0 0 4px;
  padding-right: 24px;
  font-size: 13px;
  font-weight: 600;
}

.info-box p {
  margin: 0 0 6px;
}

.info-box a {
  color: inherit;
}

.info-box p:last-child {
  margin-bottom: 0;
}

.panel-toggle {
  border: 1px solid rgba(232, 214, 192, 0.4);
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.55);
  color: #e8d6c0;
  font: 13px ui-sans-serif, system-ui, sans-serif;
  cursor: pointer;
}

.panel-toggle.hide-panel {
  position: absolute;
  top: 6px;
  right: 8px;
  width: 22px;
  height: 22px;
  padding: 0;
  line-height: 1;
  background: transparent;
}

.panel-toggle.show-panel {
  position: fixed;
  bottom: 12px;
  left: 12px;
  z-index: 1;
  padding: 3px 10px;
}

.control-panel.busy,
.control-panel.busy label {
  cursor: progress;
}

.control-panel.busy {
  opacity: 0.5;
}
</style>
