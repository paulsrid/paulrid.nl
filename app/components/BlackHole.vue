<template>
  <main class="black-hole-stage">
    <label class="finish-toggle">
      <input v-model="bloomEnabled" type="checkbox" :disabled="rendering">
      Finish (bloom)
    </label>
    <canvas
      ref="canvas"
      class="black-hole-canvas"
      :width="WIDTH"
      :height="HEIGHT"
      aria-label="Ray-traced black hole and accretion disk"
    />
  </main>
</template>

<script setup>
const WIDTH = 736
const HEIGHT = 414
const INCL = 84 * Math.PI / 180
const TILT = 0.27
const R_IN = 3.4
const R_OUT = 48
const SHADOW_PX = 122
const UNIT = SHADOW_PX / 5.196
const CX = 640
const CY = 110
const PLANET = { x: 320, y: 146, r: 7 }
const TAU = 2 * Math.PI
const STEP_FAR = 0.06
const STEP_NEAR = 0.03
const CD_F = Math.cos(STEP_FAR)
const SD_F = Math.sin(STEP_FAR)
const CD_N = Math.cos(STEP_NEAR)
const SD_N = Math.sin(STEP_NEAR)
const BOTTOM_BLOOM = 4
const STOPS = [
  [0, 5, 3, 3], [0.18, 46, 22, 11], [0.42, 150, 76, 30],
  [0.66, 238, 150, 72], [0.86, 255, 215, 160], [1.05, 255, 250, 240],
]

const canvas = ref(null)
const bloomEnabled = ref(true)
const rendering = ref(true)

let timer = 0
let outputContext
let rawCanvas
let pixels
let row = 0
const colors = [0, 0, 0]
const sample = { val: 0, a: 0 }
const sinIncl = Math.sin(INCL)
const cosIncl = Math.cos(INCL)
const cosTilt = Math.cos(TILT)
const sinTilt = Math.sin(TILT)

onMounted(() => {
  const node = canvas.value
  if (!node) return

  outputContext = node.getContext('2d')
  if (!outputContext) return
  pixels = outputContext.createImageData(WIDTH, HEIGHT)
  rawCanvas = document.createElement('canvas')
  rawCanvas.width = WIDTH
  rawCanvas.height = HEIGHT

  timer = window.setTimeout(() => renderRows(performance.now() + 40), 0)
  watch(bloomEnabled, (enabled) => {
    if (!rendering.value) applyFinish(enabled)
  })
})

onBeforeUnmount(() => window.clearTimeout(timer))

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

function diskSample(radius, angle, result) {
  const edge = smooth(R_IN, R_IN + 0.7, radius)
    * (1 - smooth(R_OUT * 0.35, R_OUT, radius))
  if (edge <= 0.001) {
    result.val = 0
    result.a = 0
    return
  }

  const intensity = (R_IN / radius) ** 2.1
  const velocity = Math.min(0.6, 1 / Math.sqrt(radius - 2))
  const gamma = 1 / Math.sqrt(1 - velocity * velocity)
  const velocityAlongSight = -velocity * Math.sin(angle) * sinIncl
  const shift = Math.sqrt(1 - 2 / radius) / (gamma * (1 - velocityAlongSight))
  const beam = shift ** 2.6
  let shearedAngle = angle + 1.6 * Math.log(radius)
  shearedAngle -= TAU * Math.floor((shearedAngle + Math.PI) / TAU)
  const dust = periodicFbm(shearedAngle, 2.3, radius * 0.9)
  const grain = periodicNoise(shearedAngle, 16, radius * 3)
  const density = clamp(dust * 1.9, 0, 1.4)

  result.val = intensity * beam * (0.12 + 1.5 * density ** 1.4)
    * (0.7 + 0.6 * grain) * edge
  result.a = clamp(0.1 + 0.8 * density, 0, 0.9) * edge
}

function traceRay(x, y) {
  const impact = Math.hypot(x, y)
  if (impact < 1e-3) return 0

  const e2x = -y * cosIncl / impact
  const e2y = x / impact
  const e2z = y * sinIncl / impact
  let u = 0
  let v = 1 / impact
  let cosPhi = 1
  let sinPhi = 0
  let previousPlane = cosIncl
  let light = 0
  let transmittance = 1

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
        if (radius > R_IN - 0.2 && radius < R_OUT) {
          const crossingCos = cosPhi + fraction * (nextCosPhi - cosPhi)
          const crossingSin = sinPhi + fraction * (nextSinPhi - sinPhi)
          const px = radius * (crossingCos * sinIncl + crossingSin * e2x)
          const py = radius * crossingSin * e2y
          diskSample(radius, Math.atan2(py, px), sample)
          light += transmittance * sample.a * sample.val
          transmittance *= 1 - sample.a
          if (transmittance < 0.02) return light
        }
      }
    }

    if (nextU >= 0.5 || nextU <= 0) return light
    u = nextU
    v = nextV
    cosPhi = nextCosPhi
    sinPhi = nextSinPhi
    previousPlane = nextPlane
  }
  return light
}

function heat(value, output) {
  if (value <= 0) {
    output[0] = 5
    output[1] = 3
    output[2] = 3
    return
  }
  const last = STOPS[STOPS.length - 1]
  if (value >= last[0]) {
    output[0] = last[1]
    output[1] = last[2]
    output[2] = last[3]
    return
  }
  let index = 0
  while (value > STOPS[index + 1][0]) index += 1
  const start = STOPS[index]
  const end = STOPS[index + 1]
  const mix = (value - start[0]) / (end[0] - start[0])
  output[0] = start[1] + (end[1] - start[1]) * mix
  output[1] = start[2] + (end[2] - start[2]) * mix
  output[2] = start[3] + (end[3] - start[3]) * mix
}

function renderRows(deadline) {
  while (row < HEIGHT && performance.now() < deadline) {
    const y = row++
    for (let x = 0; x < WIDTH; x += 1) {
      const screenX = (x - CX) / UNIT
      const screenY = -(y - CY) / UNIT
      const rayX = screenX * cosTilt + screenY * sinTilt
      const rayY = -screenX * sinTilt + screenY * cosTilt
      let light = traceRay(rayX, rayY) * 1.25

      const impact = Math.hypot(rayX, rayY)
      const ringDistance = (impact - 5.22) / 0.055
      const angle = Math.atan2(screenY, screenX)
      const lobe = 0.5 + 0.5 * Math.cos(angle - 2.6)
      light += 0.8 * Math.exp(-ringDistance * ringDistance) * (0.08 + 0.92 * lobe * lobe)

      const shadowDistance = Math.hypot(x - CX, y - CY)
      light += 0.012 + 0.05 * Math.exp(-shadowDistance / (SHADOW_PX * 2))
        * (shadowDistance > SHADOW_PX ? 1 : 0.1)
      const vignetteX = Math.max(0, (WIDTH * 0.4 - x) / (WIDTH * 0.4))
      const vignetteY = Math.max(0, (y - HEIGHT * 0.8) / (HEIGHT * 0.4))
      light *= 1 - 0.5 * clamp(vignetteX * 0.8 + vignetteY, 0, 1)

      heat(light, colors)
      const offset = (y * WIDTH + x) * 4
      pixels.data[offset] = colors[0]
      pixels.data[offset + 1] = colors[1]
      pixels.data[offset + 2] = colors[2]
      pixels.data[offset + 3] = 255
    }
  }

  outputContext.putImageData(pixels, 0, 0)
  if (row < HEIGHT) {
    timer = window.setTimeout(() => renderRows(performance.now() + 40), 0)
  } else {
    finish()
  }
}

function finish() {
  const context = rawCanvas.getContext('2d')
  context.drawImage(canvas.value, 0, 0)
  rendering.value = false
  applyFinish(bloomEnabled.value)
}

function applyFinish(enabled) {
  outputContext.globalAlpha = 1
  outputContext.globalCompositeOperation = 'source-over'
  outputContext.drawImage(rawCanvas, 0, 0)
  if (!enabled) return

  outputContext.save()
  outputContext.globalCompositeOperation = 'lighter'
  for (const [divisor, alpha] of [[6, 0.45], [20, 0.55]]) {
    const small = document.createElement('canvas')
    small.width = Math.round(WIDTH / divisor)
    small.height = Math.round(HEIGHT / divisor)
    const smallContext = small.getContext('2d')
    smallContext.imageSmoothingEnabled = true
    smallContext.imageSmoothingQuality = 'high'
    smallContext.drawImage(rawCanvas, 0, 0, small.width, small.height)
    outputContext.globalAlpha = alpha
    outputContext.imageSmoothingEnabled = true
    outputContext.imageSmoothingQuality = 'high'
    outputContext.drawImage(small, 0, 0, WIDTH, HEIGHT)
  }

  const glow = document.createElement('canvas')
  glow.width = WIDTH
  glow.height = HEIGHT
  const glowContext = glow.getContext('2d')
  const small = document.createElement('canvas')
  small.width = Math.round(WIDTH / 10)
  small.height = Math.round(HEIGHT / 10)
  const smallContext = small.getContext('2d')
  smallContext.imageSmoothingEnabled = true
  smallContext.imageSmoothingQuality = 'high'
  smallContext.drawImage(rawCanvas, 0, 0, small.width, small.height)
  glowContext.imageSmoothingEnabled = true
  glowContext.imageSmoothingQuality = 'high'
  glowContext.drawImage(small, 0, 0, WIDTH, HEIGHT)
  glowContext.globalCompositeOperation = 'destination-in'
  const mask = glowContext.createRadialGradient(CX, CY + SHADOW_PX * 0.95, 0, CX, CY + SHADOW_PX * 0.95, SHADOW_PX * 1.5)
  mask.addColorStop(0, 'rgba(0,0,0,1)')
  mask.addColorStop(0.5, 'rgba(0,0,0,0.6)')
  mask.addColorStop(1, 'rgba(0,0,0,0)')
  glowContext.fillStyle = mask
  glowContext.fillRect(0, 0, WIDTH, HEIGHT)
  outputContext.globalAlpha = 1
  for (let layer = 0; layer < BOTTOM_BLOOM; layer += 1) {
    outputContext.drawImage(glow, 0, 0)
  }
  outputContext.restore()
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

.finish-toggle {
  position: fixed;
  top: 12px;
  left: 12px;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.55);
  color: #e8d6c0;
  font: 13px ui-sans-serif, system-ui, sans-serif;
  user-select: none;
}

.finish-toggle:has(input:disabled) {
  opacity: 0.5;
  cursor: progress;
}
</style>
