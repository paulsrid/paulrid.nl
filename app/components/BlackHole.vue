<template>
  <main class="black-hole-stage">
    <section class="control-panel" :class="{ busy }" aria-label="Black hole controls">
      <label>
        <input v-model="finishEnabled" type="checkbox" :disabled="controlsDisabled">
        Finish (bloom)
      </label>
      <label>
        <input v-model="spinEnabled" type="checkbox" :disabled="controlsDisabled">
        Spin disk
      </label>
      <label class="speed-control">
        Speed
        <input v-model.number="speed" type="range" min="0" max="3" step="0.1" :disabled="controlsDisabled">
      </label>
      <label class="color-control">
        Color
        <input v-model.number="colorMix" type="range" min="0" max="1" step="0.01" :disabled="controlsDisabled">
      </label>
      <label class="radius-control">
        R in
        <input v-model.number="rIn" type="range" min="2.5" max="4.4" step="0.1" :disabled="controlsDisabled">
        <output>{{ rIn.toFixed(1) }}</output>
      </label>
      <label class="radius-control">
        R out
        <input v-model.number="rOut" type="range" min="18" max="88" step="1" :disabled="controlsDisabled">
        <output>{{ rOut }}</output>
      </label>
      <label class="size-control">
        Size
        <input v-model.number="size" type="range" min="0.35" max="1.5" step="0.05" :disabled="controlsDisabled">
        <output>{{ Math.round(size * 100) }}%</output>
      </label>
      <button type="button" class="reset-button" :disabled="controlsDisabled" @click="resetControls">
        Reset
      </button>
      <span v-if="status" role="status">{{ status }}</span>
    </section>
    <canvas
      ref="canvas"
      class="black-hole-canvas"
      :width="WIDTH"
      :height="HEIGHT"
      aria-label="Spinning ray-traced black hole and accretion disk"
    />
  </main>
</template>

<script setup>
const WIDTH = 1280
const HEIGHT = 720
const INCL = 84 * Math.PI / 180
const TILT = 0.27
const R_IN_MIN = 2.5
const R_OUT_MAX = 88
const BASE_SHADOW_PX = 122 / 736 * WIDTH
const CX = 580 / 736 * WIDTH
const CY = 110 / 414 * HEIGHT
const SPIN_RATE = 0.5
const SHEAR = 1.0
const TAU = 2 * Math.PI
const STOPS = [
  [0, 5, 3, 3], [0.18, 46, 22, 11], [0.42, 150, 76, 30],
  [0.66, 238, 150, 72], [0.86, 255, 215, 160], [1.05, 255, 250, 240],
]
const BLUE_STOPS = [
  [0, 3, 4, 8], [0.18, 12, 28, 60], [0.42, 40, 100, 190],
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
  finishEnabled: true,
  spinEnabled: true,
  speed: 1,
  size: 1,
  colorMix: 0,
  rIn: 3.4,
  rOut: 48,
}

const finishEnabled = ref(DEFAULTS.finishEnabled)
const spinEnabled = ref(DEFAULTS.spinEnabled)
const speed = ref(DEFAULTS.speed)
const size = ref(DEFAULTS.size)
const colorMix = ref(DEFAULTS.colorMix)
const rIn = ref(DEFAULTS.rIn)
const rOut = ref(DEFAULTS.rOut)
const busy = ref(true)
const controlsDisabled = ref(true)
const status = ref('Computing…')

let gl
let vao
let diskTexture
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
let unit = shadowPx / 5.196
let needsTrace = true
let dirty = true
let mounted = false

watch([finishEnabled, spinEnabled, speed, colorMix], () => {
  dirty = true
})

watch(size, () => {
  shadowPx = BASE_SHADOW_PX * size.value
  unit = shadowPx / 5.196
  needsTrace = true
  dirty = true
})

watch([rIn, rOut], () => {
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
const float CX = ${f(CX)};
const float CY = ${f(CY)};
const float TEX_MIN = ${f(TEX_MIN)};
const float TEX_STEP = ${f(TEX_STEP)};
const float TEXTURE_RADII = ${f(TEXTURE_RADII)};
const float TEXTURE_ANGLES = ${f(TEXTURE_ANGLES)};
const float SHEAR = ${f(SHEAR)};
const float SIN_INCL = ${f(Math.sin(INCL))};
const float COS_INCL = ${f(Math.cos(INCL))};
const float SIN_TILT = ${f(Math.sin(TILT))};
const float COS_TILT = ${f(Math.cos(TILT))};
vec2 pixelCoord() {
  return vec2(gl_FragCoord.x - 0.5, H - 0.5 - gl_FragCoord.y);
}
vec2 rayCoord(vec2 pix, float unitPx) {
  float screenX = (pix.x - CX) / unitPx;
  float screenY = -(pix.y - CY) / unitPx;
  return vec2(screenX * COS_TILT + screenY * SIN_TILT, -screenX * SIN_TILT + screenY * COS_TILT);
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
layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;
layout(location = 2) out vec4 o2;
layout(location = 3) out vec4 o3;

float gData[16];
int gCount = 0;

void record(float radius, float angle) {
  float edge = smoothstep(uRIn, uRIn + 0.7, radius)
    * (1.0 - smoothstep(uROut * 0.35, uROut, radius));
  if (edge <= 0.001) return;

  float intensity = pow(uRIn / radius, 2.1);
  float velocity = min(0.6, 1.0 / sqrt(radius - 2.0));
  float gamma = 1.0 / sqrt(1.0 - velocity * velocity);
  float velocityAlongSight = -velocity * sin(angle) * SIN_INCL;
  float redshift = sqrt(1.0 - 2.0 / radius) / (gamma * (1.0 - velocityAlongSight));
  float textureAngle = angle + 1.6 * log(radius);
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
uniform float uRotation;
uniform float uColor;
out vec4 outColor;

vec3 palette(float value) {
  value = clamp(value, 0.0, ${f(LUT_MAX)});
  int s = 0;
  for (int i = 0; i < 4; i += 1) {
    if (value > STOP_T[i + 1]) s = i + 1;
  }
  float t = clamp((value - STOP_T[s]) / (STOP_T[s + 1] - STOP_T[s]), 0.0, 1.0);
  return mix(mix(WARM[s], WARM[s + 1], t), mix(COOL[s], COOL[s + 1], t), uColor);
}

void main() {
  ivec2 ip = ivec2(gl_FragCoord.xy);
  vec4 a = texelFetch(uTrace0, ip, 0);
  vec4 b = texelFetch(uTrace1, ip, 0);
  vec4 c = texelFetch(uTrace2, ip, 0);
  vec4 d = texelFetch(uTrace3, ip, 0);
  float g[16] = float[16](
    a.x, a.y, a.z, a.w, b.x, b.y, b.z, b.w, c.x, c.y, c.z, c.w, d.x, d.y, d.z, d.w
  );

  float light = 0.0;
  float transmittance = 1.0;
  for (int i = 0; i < ${MAX_CROSSINGS}; i += 1) {
    float edge = g[i * 5 + 4];
    if (edge <= 0.0) continue;
    float angle = g[i * 5 + 1] - g[i * 5 + 2] * uRotation;
    angle -= TAU * floor((angle + PI) / TAU);
    vec2 uv = vec2((angle + PI) / TAU + 0.5 / TEXTURE_ANGLES, (g[i * 5] + 0.5) / TEXTURE_RADII);
    vec2 disk = texture(uDisk, uv).rg;
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

  light = (light * 1.25 + added) * vignette;
  outColor = vec4(palette(light), 1.0);
}
`

const COMPOSITE_SOURCE = `${SHADER_HEAD}
uniform sampler2D uScene;
uniform float uFinish;
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
  if (uFinish > 0.5) {
    color += 0.45 * blurLod(uv, ${f(BLOOM_LODS[0])});
    color += 0.55 * blurLod(uv, ${f(BLOOM_LODS[1])});
    float t = length(pixelCoord() - vec2(CX, CY + uShadowPx * 0.95)) / (uShadowPx * 1.5);
    float mask = t < 0.5 ? 1.0 - 0.8 * t : max(0.0, 0.6 - 1.2 * (t - 0.5));
    color += 4.0 * mask * blurLod(uv, ${f(BLOOM_LODS[2])});
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
  finishEnabled.value = DEFAULTS.finishEnabled
  spinEnabled.value = DEFAULTS.spinEnabled
  speed.value = DEFAULTS.speed
  size.value = DEFAULTS.size
  colorMix.value = DEFAULTS.colorMix
  rIn.value = DEFAULTS.rIn
  rOut.value = DEFAULTS.rOut
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

function buildDiskTexture() {
  const data = new Float32Array(TEXTURE_ANGLES * TEXTURE_RADII * 2)
  for (let radiusIndex = 0; radiusIndex < TEXTURE_RADII; radiusIndex += 1) {
    const radius = TEX_MIN + radiusIndex * TEX_STEP
    for (let angleIndex = 0; angleIndex < TEXTURE_ANGLES; angleIndex += 1) {
      const angle = -Math.PI + angleIndex * TAU / TEXTURE_ANGLES
      const density = clamp(periodicFbm(angle, 2.3, radius * 0.9) * 1.9, 0, 1.4)
      const grain = periodicNoise(angle, 16, radius * 3)
      const index = (radiusIndex * TEXTURE_ANGLES + angleIndex) * 2
      data[index] = (0.12 + 1.5 * density ** 1.4) * (0.7 + 0.6 * grain)
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

  diskTexture = createTexture(gl.RG16F, gl.RG, gl.FLOAT, buildDiskTexture(), gl.LINEAR)

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
  gl.uniform1f(uniforms.uUnit, unit)
  gl.uniform1f(uniforms.uShadowPx, shadowPx)
  gl.uniform1f(uniforms.uRotation, spinTime * SPIN_RATE)
  gl.uniform1f(uniforms.uColor, colorMix.value)
  drawPass(sceneFramebuffer)
  bindTexture(0, sceneTexture)
  gl.generateMipmap(gl.TEXTURE_2D)
}

function compositeScene() {
  const { program, uniforms } = compositeProgram
  gl.useProgram(program)
  bindTexture(0, sceneTexture)
  gl.uniform1i(uniforms.uScene, 0)
  gl.uniform1f(uniforms.uFinish, finishEnabled.value ? 1 : 0)
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
  top: 12px;
  left: 12px;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.55);
  color: #e8d6c0;
  font: 13px ui-sans-serif, system-ui, sans-serif;
  user-select: none;
}

.control-panel label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.control-panel .speed-control input,
.control-panel .color-control input,
.control-panel .radius-control input,
.control-panel .size-control input {
  width: 110px;
}

.control-panel .radius-control output,
.control-panel .size-control output {
  min-width: 34px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.control-panel .reset-button {
  align-self: flex-start;
  padding: 3px 10px;
  border: 1px solid rgba(232, 214, 192, 0.4);
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

.control-panel.busy,
.control-panel.busy label {
  cursor: progress;
}

.control-panel.busy {
  opacity: 0.5;
}
</style>
