<template>
  <main class="black-hole-stage">
    <section class="control-panel" :class="{ busy }" aria-label="Black hole controls">
      <label>
        <input v-model="finishEnabled" type="checkbox" :disabled="busy">
        Finish (bloom)
      </label>
      <label>
        <input v-model="spinEnabled" type="checkbox" :disabled="busy">
        Spin disk
      </label>
      <label class="speed-control">
        Speed
        <input v-model.number="speed" type="range" min="0" max="3" step="0.1" :disabled="busy">
      </label>
      <span v-if="busy" role="status">{{ status }}</span>
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
const PIXEL_COUNT = WIDTH * HEIGHT
const INCL = 84 * Math.PI / 180
const TILT = 0.27
const R_IN = 3.4
const R_OUT = 48
const SHADOW_PX = 122 / 736 * WIDTH
const UNIT = SHADOW_PX / 5.196
const CX = 640 / 736 * WIDTH
const CY = 110 / 414 * HEIGHT
const SPIN_RATE = 0.5
const SHEAR = 1.0
const BOTTOM_BLOOM = 4
const TAU = 2 * Math.PI
const STOPS = [
  [0, 5, 3, 3], [0.18, 46, 22, 11], [0.42, 150, 76, 30],
  [0.66, 238, 150, 72], [0.86, 255, 215, 160], [1.05, 255, 250, 240],
]
const LUT_SIZE = 2048
const LUT_MAX = 1.05
const LUT_SCALE = (LUT_SIZE - 1) / LUT_MAX
const TEXTURE_ANGLES = 1536
const TEXTURE_RADII = 512
const MIN_RADIUS = R_IN - 0.2
const RADIUS_STEP = (R_OUT - MIN_RADIUS) / (TEXTURE_RADII - 1)
const MAX_CROSSINGS = 3
const STEP_FAR = 0.06
const STEP_NEAR = 0.03
const CD_F = Math.cos(STEP_FAR)
const SD_F = Math.sin(STEP_FAR)
const CD_N = Math.cos(STEP_NEAR)
const SD_N = Math.sin(STEP_NEAR)
const sinIncl = Math.sin(INCL)
const cosIncl = Math.cos(INCL)
const cosTilt = Math.cos(TILT)
const sinTilt = Math.sin(TILT)

const canvas = ref(null)
const finishEnabled = ref(true)
const spinEnabled = ref(true)
const speed = ref(1)
const busy = ref(true)
const status = ref('Computing…')

const lutR = new Uint8Array(LUT_SIZE)
const lutG = new Uint8Array(LUT_SIZE)
const lutB = new Uint8Array(LUT_SIZE)
const textureValue = new Float32Array(TEXTURE_ANGLES * TEXTURE_RADII)
const textureAlpha = new Float32Array(TEXTURE_ANGLES * TEXTURE_RADII)
const crossingCount = new Uint8Array(PIXEL_COUNT)
const crossingRadius = new Float32Array(PIXEL_COUNT * MAX_CROSSINGS)
const crossingAngle = new Float32Array(PIXEL_COUNT * MAX_CROSSINGS)
const crossingSpeed = new Float32Array(PIXEL_COUNT * MAX_CROSSINGS)
const crossingEmission = new Float32Array(PIXEL_COUNT * MAX_CROSSINGS)
const crossingEdge = new Float32Array(PIXEL_COUNT * MAX_CROSSINGS)
const additionalLight = new Float32Array(PIXEL_COUNT)
const vignette = new Float32Array(PIXEL_COUNT)
let image
const activePixels = []

let context
let rawCanvas
let rawContext
let glowCanvas
let glowContext
let glowMask
let smallCanvases
let row = 0
let fixedTime = null
let frame = 0
let timer = 0
let lastFrameTime = 0
let spinTime = 0
let dirty = true
let mounted = false

watch([finishEnabled, spinEnabled, speed], () => {
  dirty = true
})

onMounted(() => {
  const node = canvas.value
  if (!node) return
  context = node.getContext('2d')
  if (!context) return

  image = context.createImageData(WIDTH, HEIGHT)
  rawCanvas = document.createElement('canvas')
  rawCanvas.width = WIDTH
  rawCanvas.height = HEIGHT
  rawContext = rawCanvas.getContext('2d')
  glowCanvas = document.createElement('canvas')
  glowCanvas.width = WIDTH
  glowCanvas.height = HEIGHT
  glowContext = glowCanvas.getContext('2d')
  buildGlowMask()
  smallCanvases = [makeSmallCanvas(6), makeSmallCanvas(20), makeSmallCanvas(10)]

  const parameters = new URLSearchParams(window.location.search)
  if (parameters.has('t')) {
    const requestedTime = Number.parseFloat(parameters.get('t'))
    fixedTime = Number.isFinite(requestedTime) ? requestedTime : 0
  }
  spinTime = fixedTime ?? 0
  mounted = true

  timer = window.setTimeout(() => {
    buildColorLut()
    buildDiskTexture()
    status.value = 'Tracing rays…'
    timer = window.setTimeout(() => renderRows(performance.now() + 40), 0)
  }, 30)
})

onBeforeUnmount(() => {
  mounted = false
  window.clearTimeout(timer)
  window.cancelAnimationFrame(frame)
})

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

function smooth(low, high, value) {
  const t = clamp((value - low) / (high - low), 0, 1)
  return t * t * (3 - 2 * t)
}

function buildColorLut() {
  for (let index = 0; index < LUT_SIZE; index += 1) {
    const value = index / LUT_SCALE
    let stop = 0
    while (stop < STOPS.length - 2 && value > STOPS[stop + 1][0]) stop += 1
    const start = STOPS[stop]
    const end = STOPS[stop + 1]
    const mix = clamp((value - start[0]) / (end[0] - start[0]), 0, 1)
    lutR[index] = start[1] + (end[1] - start[1]) * mix
    lutG[index] = start[2] + (end[2] - start[2]) * mix
    lutB[index] = start[3] + (end[3] - start[3]) * mix
  }
}

function buildDiskTexture() {
  for (let radiusIndex = 0; radiusIndex < TEXTURE_RADII; radiusIndex += 1) {
    const radius = MIN_RADIUS + radiusIndex * RADIUS_STEP
    for (let angleIndex = 0; angleIndex < TEXTURE_ANGLES; angleIndex += 1) {
      const angle = -Math.PI + angleIndex * TAU / TEXTURE_ANGLES
      const density = clamp(periodicFbm(angle, 2.3, radius * 0.9) * 1.9, 0, 1.4)
      const grain = periodicNoise(angle, 16, radius * 3)
      const index = radiusIndex * TEXTURE_ANGLES + angleIndex
      textureValue[index] = (0.12 + 1.5 * density ** 1.4) * (0.7 + 0.6 * grain)
      textureAlpha[index] = clamp(0.1 + 0.8 * density, 0, 0.9)
    }
  }
}

function recordCrossing(pixel, radius, angle) {
  const count = crossingCount[pixel]
  const edge = smooth(R_IN, R_IN + 0.7, radius)
    * (1 - smooth(R_OUT * 0.35, R_OUT, radius))
  if (edge <= 0.001) return false

  const intensity = (R_IN / radius) ** 2.1
  const velocity = Math.min(0.6, 1 / Math.sqrt(radius - 2))
  const gamma = 1 / Math.sqrt(1 - velocity * velocity)
  const velocityAlongSight = -velocity * Math.sin(angle) * sinIncl
  const redshift = Math.sqrt(1 - 2 / radius) / (gamma * (1 - velocityAlongSight))
  let textureAngle = angle + 1.6 * Math.log(radius)
  textureAngle -= TAU * Math.floor((textureAngle + Math.PI) / TAU)
  const index = pixel * MAX_CROSSINGS + count

  crossingRadius[index] = clamp((radius - MIN_RADIUS) / RADIUS_STEP, 0, TEXTURE_RADII - 1.001)
  crossingAngle[index] = textureAngle
  crossingSpeed[index] = (R_IN / radius) ** SHEAR
  crossingEmission[index] = intensity * redshift ** 2.6 * edge
  crossingEdge[index] = edge
  crossingCount[pixel] = count + 1
  return true
}

function traceRay(x, y, pixel) {
  const impact = Math.hypot(x, y)
  if (impact < 1e-3) return

  const e2x = -y * cosIncl / impact
  const e2y = x / impact
  const e2z = y * sinIncl / impact
  let u = 0
  let v = 1 / impact
  let cosPhi = 1
  let sinPhi = 0
  let previousPlane = cosIncl

  for (let step = 0; step < 420; step += 1) {
    const far = u < 0.035
    const h = far ? STEP_FAR : STEP_NEAR
    const k1u = v
    const k1v = -u + 3 * u * u
    const u2 = u + 0.5 * h * k1u
    const v2 = v + 0.5 * h * k1v
    const k2u = v2
    const k2v = -u2 + 3 * u2 * u2
    const u3 = u + 0.5 * h * k2u
    const v3 = v + 0.5 * h * k2v
    const k3u = v3
    const k3v = -u3 + 3 * u3 * u3
    const u4 = u + h * k3u
    const v4 = v + h * k3v
    const k4u = v4
    const k4v = -u4 + 3 * u4 * u4
    const nextU = u + h / 6 * (k1u + 2 * k2u + 2 * k3u + k4u)
    const nextV = v + h / 6 * (k1v + 2 * k2v + 2 * k3v + k4v)
    const cosDelta = far ? CD_F : CD_N
    const sinDelta = far ? SD_F : SD_N
    const nextCosPhi = cosPhi * cosDelta - sinPhi * sinDelta
    const nextSinPhi = sinPhi * cosDelta + cosPhi * sinDelta
    const nextPlane = nextCosPhi * cosIncl + nextSinPhi * e2z

    if (previousPlane * nextPlane < 0) {
      const fraction = previousPlane / (previousPlane - nextPlane)
      const crossingU = u + fraction * (nextU - u)
      if (crossingU > 0) {
        const radius = 1 / crossingU
        if (radius > MIN_RADIUS && radius < R_OUT) {
          const crossingCos = cosPhi + fraction * (nextCosPhi - cosPhi)
          const crossingSin = sinPhi + fraction * (nextSinPhi - sinPhi)
          const px = radius * (crossingCos * sinIncl + crossingSin * e2x)
          const py = radius * crossingSin * e2y
          recordCrossing(pixel, radius, Math.atan2(py, px))
          if (crossingCount[pixel] >= MAX_CROSSINGS) return
        }
      }
    }

    if (nextU >= 0.5 || nextU <= 0) return
    u = nextU
    v = nextV
    cosPhi = nextCosPhi
    sinPhi = nextSinPhi
    previousPlane = nextPlane
  }
}

function shadePixel(pixel, rotation) {
  let light = 0
  const count = crossingCount[pixel]
  if (count) {
    let transmittance = 1
    for (let crossing = 0; crossing < count; crossing += 1) {
      const index = pixel * MAX_CROSSINGS + crossing
      let angle = crossingAngle[index] - crossingSpeed[index] * rotation
      angle -= TAU * Math.floor((angle + Math.PI) / TAU)
      const anglePosition = (angle + Math.PI) * (TEXTURE_ANGLES / TAU)
      const angleIndex = anglePosition | 0
      const angleMix = anglePosition - angleIndex
      const nextAngleIndex = angleIndex + 1 === TEXTURE_ANGLES ? 0 : angleIndex + 1
      const radiusPosition = crossingRadius[index]
      const radiusIndex = radiusPosition | 0
      const radiusMix = radiusPosition - radiusIndex
      const offset0 = radiusIndex * TEXTURE_ANGLES
      const offset1 = offset0 + TEXTURE_ANGLES
      const value = (textureValue[offset0 + angleIndex] * (1 - angleMix)
        + textureValue[offset0 + nextAngleIndex] * angleMix) * (1 - radiusMix)
        + (textureValue[offset1 + angleIndex] * (1 - angleMix)
          + textureValue[offset1 + nextAngleIndex] * angleMix) * radiusMix
      const alpha = (textureAlpha[offset0 + angleIndex] * (1 - angleMix)
        + textureAlpha[offset0 + nextAngleIndex] * angleMix) * (1 - radiusMix)
        + (textureAlpha[offset1 + angleIndex] * (1 - angleMix)
          + textureAlpha[offset1 + nextAngleIndex] * angleMix) * radiusMix
      const opacity = alpha * crossingEdge[index]
      light += transmittance * opacity * crossingEmission[index] * value
      transmittance *= 1 - opacity
      if (transmittance < 0.02) break
    }
  }

  light = (light * 1.25 + additionalLight[pixel]) * vignette[pixel]
  let colorIndex = (light * LUT_SCALE) | 0
  colorIndex = clamp(colorIndex, 0, LUT_SIZE - 1)
  const offset = pixel * 4
  image.data[offset] = lutR[colorIndex]
  image.data[offset + 1] = lutG[colorIndex]
  image.data[offset + 2] = lutB[colorIndex]
  image.data[offset + 3] = 255
}

function shadeActive(rotation) {
  for (let index = 0; index < activePixels.length; index += 1) {
    shadePixel(activePixels[index], rotation)
  }
}

function makeSmallCanvas(divisor) {
  const small = document.createElement('canvas')
  small.width = Math.round(WIDTH / divisor)
  small.height = Math.round(HEIGHT / divisor)
  const smallContext = small.getContext('2d')
  smallContext.imageSmoothingEnabled = true
  smallContext.imageSmoothingQuality = 'high'
  return { canvas: small, context: smallContext }
}

function applyFinish(enabled) {
  context.globalAlpha = 1
  context.globalCompositeOperation = 'source-over'
  context.drawImage(rawCanvas, 0, 0)
  if (!enabled) return

  context.save()
  context.globalCompositeOperation = 'lighter'
  for (const [small, alpha] of [[smallCanvases[0], 0.45], [smallCanvases[1], 0.55]]) {
    small.context.clearRect(0, 0, small.canvas.width, small.canvas.height)
    small.context.drawImage(rawCanvas, 0, 0, small.canvas.width, small.canvas.height)
    context.globalAlpha = alpha
    context.drawImage(small.canvas, 0, 0, WIDTH, HEIGHT)
  }

  const smallGlow = smallCanvases[2]
  smallGlow.context.clearRect(0, 0, smallGlow.canvas.width, smallGlow.canvas.height)
  smallGlow.context.drawImage(rawCanvas, 0, 0, smallGlow.canvas.width, smallGlow.canvas.height)
  glowContext.globalCompositeOperation = 'source-over'
  glowContext.clearRect(0, 0, WIDTH, HEIGHT)
  glowContext.drawImage(smallGlow.canvas, 0, 0, WIDTH, HEIGHT)
  glowContext.globalCompositeOperation = 'destination-in'
  glowContext.fillStyle = glowMask
  glowContext.fillRect(0, 0, WIDTH, HEIGHT)
  context.globalAlpha = 1
  for (let layer = 0; layer < BOTTOM_BLOOM; layer += 1) {
    context.drawImage(glowCanvas, 0, 0)
  }
  context.restore()
}

function renderRows(deadline) {
  while (row < HEIGHT && performance.now() < deadline) {
    const y = row++
    for (let x = 0; x < WIDTH; x += 1) {
      const pixel = y * WIDTH + x
      const screenX = (x - CX) / UNIT
      const screenY = -(y - CY) / UNIT
      const rayX = screenX * cosTilt + screenY * sinTilt
      const rayY = -screenX * sinTilt + screenY * cosTilt
      traceRay(rayX, rayY, pixel)
      if (crossingCount[pixel]) activePixels.push(pixel)

      const impact = Math.hypot(rayX, rayY)
      const ringDistance = (impact - 5.22) / 0.055
      const angle = Math.atan2(screenY, screenX)
      const lobe = 0.5 + 0.5 * Math.cos(angle - 2.6)
      let added = 0.8 * Math.exp(-ringDistance * ringDistance) * (0.08 + 0.92 * lobe * lobe)
      const shadowDistance = Math.hypot(x - CX, y - CY)
      added += 0.012 + 0.05 * Math.exp(-shadowDistance / (SHADOW_PX * 2))
        * (shadowDistance > SHADOW_PX ? 1 : 0.1)
      additionalLight[pixel] = added
      const vignetteX = Math.max(0, (WIDTH * 0.4 - x) / (WIDTH * 0.4))
      const vignetteY = Math.max(0, (y - HEIGHT * 0.8) / (HEIGHT * 0.4))
      vignette[pixel] = 1 - 0.5 * clamp(vignetteX * 0.8 + vignetteY, 0, 1)
      shadePixel(pixel, spinTime * SPIN_RATE)
    }
  }

  context.putImageData(image, 0, 0)
  if (row < HEIGHT) {
    timer = window.setTimeout(() => renderRows(performance.now() + 40), 0)
  } else {
    finishInitialRender()
  }
}

function finishInitialRender() {
  shadeActive(spinTime * SPIN_RATE)
  rawContext.putImageData(image, 0, 0)
  applyFinish(finishEnabled.value)
  window.__done = true
  busy.value = false
  if (fixedTime !== null) return

  frame = window.requestAnimationFrame((time) => {
    lastFrameTime = time
    tick(time)
  })
}

function tick(now) {
  if (!mounted) return
  const delta = Math.min(0.1, (now - lastFrameTime) / 1000)
  lastFrameTime = now
  const spinning = spinEnabled.value && speed.value > 0
  if (spinning) spinTime += delta * speed.value
  if (spinning || dirty) {
    shadeActive(spinTime * SPIN_RATE)
    rawContext.putImageData(image, 0, 0)
    applyFinish(finishEnabled.value)
    dirty = false
  }
  frame = window.requestAnimationFrame(tick)
}

function buildGlowMask() {
  glowContext.imageSmoothingEnabled = true
  glowContext.imageSmoothingQuality = 'high'
  const centerX = CX
  const centerY = CY + SHADOW_PX * 0.95
  const radius = SHADOW_PX * 1.5
  glowMask = glowContext.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius)
  glowMask.addColorStop(0, 'rgba(0,0,0,1)')
  glowMask.addColorStop(0.5, 'rgba(0,0,0,0.6)')
  glowMask.addColorStop(1, 'rgba(0,0,0,0)')
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

.control-panel .speed-control input {
  width: 110px;
}

.control-panel.busy,
.control-panel.busy label {
  cursor: progress;
}

.control-panel.busy {
  opacity: 0.5;
}
</style>
