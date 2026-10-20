<template>
  <div>
    <UButton
      v-if="panelHidden"
      class="fixed bottom-3 left-3 z-10"
      color="neutral"
      variant="subtle"
      icon="i-lucide-sliders-horizontal"
      label="Controls"
      @click="panelHidden = false"
    />
    <div class="fixed top-3 right-3 z-10 flex items-center gap-2">
      <UBadge
        v-if="fps !== null"
        color="neutral"
        variant="subtle"
        class="font-mono tabular-nums"
        aria-label="Frames per second"
      >
        {{ fps }} FPS
      </UBadge>
      <UButton
        color="neutral"
        variant="subtle"
        icon="i-lucide-info"
        aria-label="How this is made"
        @click="infoOpen = true"
      />
    </div>

    <UDrawer
      :open="!panelHidden"
      title="Controls"
      description="Mass, spin, view, accretion disk and display settings. Hover over a control for an explanation."
      direction="bottom"
      :modal="false"
      :overlay="false"
      :dismissible="false"
      :handle="false"
      close
      :content="{ style: panelColors }"
      @update:open="panelHidden = !$event"
    >
      <template #body>
        <UTabs :items="controlTabs" variant="link" size="sm" :unmount-on-hide="false">
          <template #blackhole>
            <div class="grid gap-x-6 gap-y-3 pt-3 sm:grid-cols-2">
              <ControlSlider v-model="massLog" label="Mass (M☉)" hint="Mass of the black hole in solar masses (logarithmic, 1 to 66 billion). The default is about Sagittarius A*. The picture looks the same at any mass, because the physics scales with it; mass sets the real size, shown as the horizon radius." :min="MASS_LOG_MIN" :max="MASS_LOG_MAX" :step="0.02" :display="formatMass(solarMass)" :disabled="controlsDisabled" />
              <ControlSlider v-model="spin" label="Spin a/M" hint="Spin of the black hole, a/M, from 0 (not rotating) to 0.998 (nearly the maximum). More spin drags space around, shrinks the horizon, moves the disk's inner edge closer and flattens the shadow." :min="0" :max="MAX_SPIN" :step="0.002" :display="spin.toFixed(3)" :disabled="controlsDisabled" />
              <UTooltip text="Size of the event horizon (the point of no return) for the chosen mass and spin. It shrinks as the spin grows.">
                <UBadge color="neutral" variant="subtle">Horizon radius {{ formatLength(horizonKm) }}</UBadge>
              </UTooltip>
            </div>
          </template>
          <template #view>
            <div class="grid gap-x-6 gap-y-3 pt-3 sm:grid-cols-2">
              <ControlSlider v-model="zoom" label="Zoom" hint="Camera distance: how large the hole appears on screen. It does not change the physics. The scroll wheel does the same." :min="0.1" :max="1.5" :step="0.05" :display="`${Math.round(zoom * 100)}%`" :disabled="controlsDisabled" />
              <ControlSlider v-model="pitch" label="Pitch" hint="Tilt of the disk towards the viewer. 0° sees it edge-on, 89° almost face-on. Dragging up or down changes it." :min="0" :max="89" :step="1" :display="`${Math.round(pitch)}°`" :disabled="controlsDisabled" />
              <ControlSlider v-model="yaw" label="Yaw" hint="Swing the disk's tilt to the left or right. Dragging sideways changes it." :min="-90" :max="90" :step="1" :display="`${Math.round(yaw)}°`" :disabled="controlsDisabled" />
              <ControlSlider v-model="roll" label="Roll" hint="Rotate the view around the line of sight, like turning the camera. Snaps to 0 near zero." :min="-180" :max="180" :step="0.5" :display="`${roll.toFixed(1)}°`" :disabled="controlsDisabled" />
            </div>
          </template>
          <template #disk>
            <div class="grid gap-x-6 gap-y-3 pt-3 sm:grid-cols-2 lg:grid-cols-4">
              <ControlSlider v-model="speed" label="Speed" hint="How fast the disk rotates. 0 freezes it, and the picture stops redrawing, which saves power." :min="0" :max="5" :step="0.1" :display="speed.toFixed(1)" :disabled="controlsDisabled" />
              <ControlSlider v-model="temperature" label="Temperature" hint="Temperature of the disk at its brightest ring, from about 3,500 K (orange) to 10,000 K (blue-white). Every other part is coloured from this using the disk model, Doppler shift and redshift." :min="0" :max="1" :step="0.01" :display="`${Math.round(3500 + 6500 * temperature)}K`" :disabled="controlsDisabled" />
              <ControlSlider v-model="brightness" label="Brightness" hint="Exposure of the accretion disk. It changes how bright the disk looks, not its temperature or colour." :min="0" :max="3" :step="0.1" :display="brightness.toFixed(1)" :disabled="controlsDisabled" />
              <ControlSlider v-model="rIn" label="R in" hint="Inner edge of the disk, in units of GM/c². It cannot go inside the innermost stable orbit, which depends on the spin, so this only moves the edge outwards; the value shown is the edge in use." :min="R_IN_MIN" :max="6" :step="0.1" :display="innerRadius.toFixed(1)" :disabled="controlsDisabled" />
              <ControlSlider v-model="rOut" label="R out" hint="Outer edge of the disk, in units of GM/c². The disk fades out towards this radius." :min="18" :max="88" :step="1" :display="`${Math.round(rOut)}`" :disabled="controlsDisabled" />
              <ControlSlider v-model="detail" label="Detail" hint="Size of the clumps in the disk texture: higher gives finer, more numerous structure. Rebuilds the texture when released." :min="1" :max="12" :step="0.5" :display="detail.toFixed(1)" :disabled="controlsDisabled" @change="rebuildDiskTexture" />
              <ControlSlider v-model="contrast" label="Contrast" hint="How strongly the clumps stand out from the smooth disk. Rebuilds the texture when released." :min="0.5" :max="3" :step="0.1" :display="contrast.toFixed(1)" :disabled="controlsDisabled" @change="rebuildDiskTexture" />
            </div>
          </template>
          <template #display>
            <div class="grid gap-x-6 gap-y-3 pt-3 sm:grid-cols-2">
              <ControlSlider v-model="bloom" label="Bloom" hint="Strength of the glow around bright areas. Purely cosmetic; 0 turns it off." :min="0" :max="2" :step="0.05" :display="bloom.toFixed(2)" :disabled="controlsDisabled" />
              <UTooltip :ui="tipUi" text="Draw a thin ring at the true size of the event horizon. The black disc you see is larger: it is the shadow, where light bent by gravity is lost.">
                <UCheckbox v-model="showHorizon" label="Show event horizon" :disabled="controlsDisabled" />
              </UTooltip>
              <UTooltip :ui="tipUi" text="Draw a yellow ring with the Sun's true radius (695,700 km) at the same scale. Raise the mass and the Sun shrinks relative to the hole. For a hole of a few solar masses the Sun is larger than the screen.">
                <UCheckbox v-model="showSun" label="Show Sun for scale" :disabled="controlsDisabled" />
              </UTooltip>
              <UTooltip :ui="tipUi" text="Draw a violet ring with the Earth's true radius (6,371 km) at the same scale. It is off-screen for small holes and shrinks to a dot above a few hundred thousand solar masses; it is easiest to see between a few hundred and a few hundred thousand.">
                <UCheckbox v-model="showEarth" label="Show Earth for scale" :disabled="controlsDisabled" />
              </UTooltip>
              <UTooltip :ui="tipUi" text="Draw a green ring the size of the Solar System out to Neptune's orbit (30 AU, 4.5 billion km radius) at the same scale. It only fits on screen for very massive holes, roughly a billion solar masses or more.">
                <UCheckbox v-model="showSolarSystem" label="Show Solar System (Neptune)" :disabled="controlsDisabled" />
              </UTooltip>
            </div>
          </template>
        </UTabs>
      </template>
      <template #footer>
        <UTooltip text="Smoothly return every setting to its default.">
          <UButton color="neutral" variant="outline" icon="i-lucide-rotate-ccw" label="Reset" :disabled="controlsDisabled" @click="resetControls" />
        </UTooltip>
        <UBadge v-if="status" color="neutral" variant="subtle" role="status">{{ status }}</UBadge>
      </template>
    </UDrawer>

    <UDrawer
      v-model:open="infoOpen"
      title="How this is made"
      description="About this render"
      direction="right"
      :modal="false"
      :overlay="false"
      :handle="false"
      close
    >
      <template #body>
        <div class="space-y-3 text-sm">
          <p>
            Nothing here is a video or a 3D model. Every pixel fires a light ray backwards from the
            camera and bends it through the curved space around a spinning (Kerr) black hole,
            following the method of James et al., "Gravitational lensing by spinning black holes in
            astrophysics, and in the movie Interstellar" (2015). A numerical solver (RK4) integrates
            the light-ray equations in a WebGL2 shader on your GPU. Spin 0 gives a Schwarzschild hole.
          </p>
          <p>
            Where a ray crosses the accretion disk plane, it picks up the disk's colour and
            brightness. Rays can cross more than once, which gives the glowing arc that appears
            over the top and under the hole (the far side of the disk, bent into view).
          </p>
          <p>
            The disk is a thin accretion disk that ends at the innermost stable orbit, which moves
            inward as the spin grows. Its brightness follows the Novikov-Thorne model: zero at the
            inner edge, peaking a little outside it, then fading with radius. The local temperature
            follows from that flux, and each pixel is coloured as a blackbody at the temperature
            seen after Doppler shift and gravitational redshift (computed for Kerr circular
            orbits), so the approaching side is hotter and brighter. A procedural noise texture,
            sheared so the inside orbits faster than the outside, adds the clumpy structure, and a
            final bloom pass adds the glow.
          </p>
          <p>
            Mass and size: the physics is scale-free, so the picture looks the same for any mass
            (1 to 66 billion solar masses, the estimated mass of TON 618). The Mass slider only sets
            the real size. One gravitational radius, GM/c², is 1.48 km per solar mass. The event
            horizon is two of those for a non-spinning hole and shrinks towards one at maximum spin.
            The black disc you see is the shadow, about 2.6 times the horizon for a non-spinning
            hole, because gravity bends light into the hole from beyond it.
          </p>
          <p>
            Scale rings, all drawn at the same scale as the hole: blue is the event horizon, violet
            the Earth (6,371 km radius), yellow the Sun (695,700 km) and green the orbit of Neptune
            (30 AU). Each is labelled and hidden when it is off-screen. The Earth and Sun are easiest
            to see for holes of a few hundred to a few hundred thousand solar masses, and the
            Neptune ring only fits for roughly a billion solar masses or more.
          </p>
          <p>
            Controls: drag to rotate the view and scroll to zoom. The panel groups the controls into
            the black hole (mass, spin), the view (zoom, pitch, yaw, roll), the accretion disk (speed,
            temperature, brightness, edges, texture) and the display (bloom and the scale rings).
            Hover over any control for an explanation, and Reset eases everything back to the
            defaults. The counter in the top right shows rendered frames per second.
          </p>
          <p>
            The disk model follows the thin-disk theory reviewed in Abramowicz and Fragile,
            "Foundations of Black Hole Accretion Disk Theory" (Living Reviews in Relativity, 2013);
            thicker disk models are not included.
          </p>
          <p>
            Copyright 2026 Paul Rid<template v-if="contact">
              (<ULink :to="`mailto:${contact}`">{{ contact }}</ULink>)</template>.
          </p>
        </div>
      </template>
    </UDrawer>

    <canvas
      ref="canvas"
      class="block h-screen w-screen touch-none object-cover"
      :class="dragging ? 'cursor-grabbing' : 'cursor-grab'"
      @pointerdown="startDrag"
      @pointermove="dragMove"
      @pointerup="endDrag"
      @pointercancel="endDrag"
      @wheel.prevent="wheelZoom"
      :width="WIDTH"
      :height="HEIGHT"
      title="Drag to rotate the view, scroll to zoom"
      aria-label="Spinning ray-traced black hole and accretion disk"
    />
    <div
      v-for="label in ringLabels"
      :key="label.key"
      class="pointer-events-none fixed z-10 whitespace-nowrap text-[11px] leading-[14px] select-none [text-shadow:0_0_3px_#000,0_0_3px_#000]"
      :style="{ left: `${label.left}px`, top: `${label.top}px`, color: label.color }"
    >
      {{ label.text }}
    </div>
  </div>
</template>

<script setup>
// Internal render size. Every pixel is a traced ray, so cost scales with this;
// the canvas is stretched to the window, so a larger size gives smoother edges.
const WIDTH = 1920
const HEIGHT = 1080
const R_IN_MIN = 1.2
const R_OUT_MAX = 88
const MIN_INCL = 0.1
const MAX_SPIN = 0.998
// Geometric units (G = c = M = 1). Rays are captured just outside the horizon,
// where Boyer-Lindquist coordinates become singular.
const HORIZON_MARGIN = 0.02
const BASE_SHADOW_PX = 122 / 736 * WIDTH
const CX = WIDTH / 2
const CY = HEIGHT / 2
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
// Disk colour: the temperature at the flux peak runs from PEAK_TEMP_WARM to
// PEAK_TEMP_COOL with the Temperature slider; DISK_EXPOSURE sets overall brightness.
const PEAK_TEMP_WARM = 3500
const PEAK_TEMP_COOL = 10000
const DISK_EXPOSURE = 1.6
const FLUX_SAMPLES = 600
// Bloom is three Gaussian blurs of the scene, each at a reduced resolution
// (2^level times smaller) so wide blurs stay cheap. Radii are in pixels, tuned
// at 1280 wide; sigma is about 0.8 of the radius.
const BLOOM_RADII = [6, 20, 10]
const BLOOM_LEVELS = [2, 3, 3]
const BLOOM_SIGMA_SCALE = 0.8 * WIDTH / 1280
const BLOOM_TAPS = 14

const canvas = ref(null)
const DEFAULTS = {
  bloom: 1,
  speed: 1,
  zoom: 1,
  // log10 of the mass in solar masses; 6.63 is Sagittarius A* (about 4.3 million)
  massLog: 6.63,
  showHorizon: false,
  showSun: false,
  showEarth: false,
  showSolarSystem: false,
  temperature: 0,
  brightness: 0.7,
  roll: 15.5,
  pitch: 84,
  yaw: 0,
  detail: 8,
  contrast: 1.4,
  rIn: R_IN_MIN,
  rOut: 36,
  spin: 0.9,
}

const bloom = ref(DEFAULTS.bloom)
const speed = ref(DEFAULTS.speed)
const zoom = ref(DEFAULTS.zoom)
const massLog = ref(DEFAULTS.massLog)
const showHorizon = ref(DEFAULTS.showHorizon)
const showSun = ref(DEFAULTS.showSun)
const showEarth = ref(DEFAULTS.showEarth)
const showSolarSystem = ref(DEFAULTS.showSolarSystem)
const EARTH_RADIUS_KM = 6371
const SOLAR_RADIUS_KM = 695700
const MASS_LOG_MIN = 0
// TON 618, about 66 billion solar masses (log10 = 10.82)
const MASS_LOG_MAX = 10.82
// One gravitational radius GM/c^2 per solar mass, in km
const KM_PER_SOLAR_MASS = 1.4766
const KM_PER_AU = 1.496e8
// Neptune's orbit (semi-major axis 30.07 AU), the outermost planet
const NEPTUNE_ORBIT_KM = 30.07 * KM_PER_AU
const solarMass = computed(() => 10 ** massLog.value)
const temperature = ref(DEFAULTS.temperature)
const brightness = ref(DEFAULTS.brightness)
const roll = ref(DEFAULTS.roll)
const pitch = ref(DEFAULTS.pitch)
const yaw = ref(DEFAULTS.yaw)
const detail = ref(DEFAULTS.detail)
const contrast = ref(DEFAULTS.contrast)
const rIn = ref(DEFAULTS.rIn)
const rOut = ref(DEFAULTS.rOut)
const spin = ref(DEFAULTS.spin)
const panelHidden = ref(true)
const infoOpen = ref(false)
const controlTabs = [
  { label: 'Black hole', icon: 'i-lucide-orbit', slot: 'blackhole' },
  { label: 'View', icon: 'i-lucide-eye', slot: 'view' },
  { label: 'Accretion disk', icon: 'i-lucide-disc', slot: 'disk' },
  { label: 'Display', icon: 'i-lucide-monitor', slot: 'display' },
]
// The tooltip hints are long, so let them wrap
const tipUi = { content: 'h-auto max-w-xs py-1.5', text: 'whitespace-normal' }
const busy = ref(true)
const controlsDisabled = ref(true)
const status = ref('Computing…')
// Rendered frames per second, sampled over FPS_INTERVAL ms. Counts frames actually
// drawn, so it reads 0 while the scene is idle.
const FPS_INTERVAL = 500
const fps = ref(null)
let fpsFrames = 0
let fpsStart = 0

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
let downsampleProgram
let blurProgram
let bloomLevels = {}
let bloomTargets = []
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

watch([bloom, speed, temperature, brightness, showHorizon, showSun, showEarth, showSolarSystem, massLog], () => {
  dirty = true
})

// The render is scale-free (G = c = M = 1), so mass does not change the picture;
// it only sets the physical size. The horizon is at r+ = M (1 + sqrt(1 - a^2)).
const horizonRadius = computed(() => 1 + Math.sqrt(1 - spin.value * spin.value))
// The Sun's radius in units of M, so it shares the render's scale
const sunRadius = computed(() => SOLAR_RADIUS_KM / (KM_PER_SOLAR_MASS * solarMass.value))
const earthRadius = computed(() => EARTH_RADIUS_KM / (KM_PER_SOLAR_MASS * solarMass.value))
const solarSystemRadius = computed(() => NEPTUNE_ORBIT_KM / (KM_PER_SOLAR_MASS * solarMass.value))
const horizonKm = computed(() => horizonRadius.value * KM_PER_SOLAR_MASS * solarMass.value)

// Labels for the scale rings are HTML over the canvas. The canvas is stretched
// with object-fit: cover, so render pixels map to the window by a uniform scale
// and a centring offset. Each label sits just right of its ring, stacked so
// rings of equal size do not overprint each other's text.
const viewport = ref({ width: 0, height: 0 })
const LABEL_HEIGHT = 14
const ringLabels = computed(() => {
  const { width, height } = viewport.value
  if (!width) return []
  const scale = Math.max(width / WIDTH, height / HEIGHT)
  const offsetX = (width - WIDTH * scale) / 2
  const offsetY = (height - HEIGHT * scale) / 2
  const pxPerM = BASE_SHADOW_PX * zoom.value / 5.196
  const rings = [
    [showHorizon.value, 'horizon', `Event horizon, ${formatLength(horizonKm.value)} radius`, horizonRadius.value, '#73d9ff'],
    [showEarth.value, 'earth', 'Earth, 6,371 km radius', earthRadius.value, '#cc99ff'],
    [showSun.value, 'sun', 'Sun, 695,700 km radius', sunRadius.value, '#ffd926'],
    [showSolarSystem.value, 'neptune', 'Neptune’s orbit, 30 AU radius', solarSystemRadius.value, '#66ff80'],
  ].filter(ring => ring[0])
  return rings
    .map(([, key, text, radiusM, color], index) => ({
      key,
      text,
      color,
      left: offsetX + (CX + radiusM * pxPerM) * scale + 6,
      top: offsetY + CY * scale - LABEL_HEIGHT / 2 + (index - (rings.length - 1) / 2) * LABEL_HEIGHT,
    }))
    .filter(label => label.left > 0 && label.left < width - 40)
})
const updateViewport = () => {
  viewport.value = { width: window.innerWidth, height: window.innerHeight }
}

function formatMass(value) {
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`
  return value.toFixed(0)
}

function formatLength(km) {
  if (km >= KM_PER_AU * 0.1) return `${(km / KM_PER_AU).toFixed(2)} AU`
  if (km >= 1e6) return `${(km / 1e6).toFixed(1)} million km`
  return `${km.toLocaleString('en-US', { maximumFractionDigits: 0 })} km`
}

watch(zoom, () => {
  shadowPx = BASE_SHADOW_PX * zoom.value
  unit = shadowPx / 5.196
  needsTrace = true
  dirty = true
})

watch(roll, (value) => {
  if (!resetting && value !== 0 && Math.abs(value) <= ROLL_SNAP) roll.value = 0
})

// Prograde innermost stable circular orbit of a Kerr hole (Bardeen, Press & Teukolsky 1972).
// The disk is truncated there, so the "R in" slider only moves the edge outward.
const iscoRadius = (a) => {
  const z1 = 1 + Math.cbrt(1 - a * a) * (Math.cbrt(1 + a) + Math.cbrt(1 - a))
  const z2 = Math.sqrt(3 * a * a + z1 * z1)
  return 3 + z2 - Math.sqrt((3 - z1) * (3 + z1 + 2 * z2))
}
const innerRadius = computed(() => Math.max(rIn.value, iscoRadius(spin.value)))

// Novikov-Thorne flux (Page & Thorne 1974), mirrored from the trace shader so the
// peak over the visible disk can be found and the shader flux scaled to 1 there.
function fluxRoots(a) {
  const phase = Math.acos(a) / 3
  return [
    Math.sqrt(iscoRadius(a)),
    2 * Math.cos(phase - Math.PI / 3),
    2 * Math.cos(phase + Math.PI / 3),
    -2 * Math.cos(phase),
  ]
}

function diskFlux(radius, a, [x0, x1, x2, x3]) {
  const x = Math.max(Math.sqrt(radius), x0 * 1.0001)
  const term = (xi, xj, xk) => 3 * (xi - a) ** 2 / (xi * (xi - xj) * (xi - xk)) * Math.log((x - xi) / (x0 - xi))
  const bracket = x - x0 - 1.5 * a * Math.log(x / x0) - term(x1, x2, x3) - term(x2, x1, x3) - term(x3, x1, x2)
  return Math.max(bracket, 0) / (x ** 4 * (x ** 3 - 3 * x + 2 * a))
}

function peakDiskFlux(a, roots) {
  let peak = 0
  const from = innerRadius.value
  for (let i = 0; i <= FLUX_SAMPLES; i += 1) {
    peak = Math.max(peak, diskFlux(from + (rOut.value - from) * i / FLUX_SAMPLES, a, roots))
  }
  return peak
}

watch([rIn, rOut, roll, pitch, yaw, spin], () => {
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
const int MAX_STEPS = 1000;
const float STEP_MAX = 0.006;
const float PHI_PER_STEP = 0.035;
uniform float uUnit;
uniform float uRIn;
uniform float uROut;
uniform float uIncl;
uniform float uSpin;
uniform float uCapture;
// Page & Thorne roots (sqrt(r_isco), x1, x2, x3) and 1 / peak flux, see novikovThorneFlux
uniform vec4 uRoots;
uniform float uFluxNorm;
layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;
layout(location = 2) out vec4 o2;
layout(location = 3) out vec4 o3;

float gData[16];
int gCount = 0;
// Kerr photon constants for the current ray (E = 1): azimuthal momentum L,
// Carter constant Q, and the combinations used by the radial potential.
float gL = 0.0;
float gC = 0.0;
float gK = 0.0;

float rootTerm(float xi, float xj, float xk, float x, float a) {
  return 3.0 * (xi - a) * (xi - a) / (xi * (xi - xj) * (xi - xk))
    * log((x - xi) / (uRoots.x - xi));
}

// Flux radiated by a thin disk around a Kerr hole (Novikov & Thorne 1973, in the
// closed form of Page & Thorne 1974, x = sqrt(r)). It vanishes at the innermost
// stable orbit and falls as r^-3 far out; uFluxNorm scales the peak to 1.
float novikovThorneFlux(float radius) {
  float a = max(uSpin, 0.001);
  float x0 = uRoots.x;
  float x = max(sqrt(radius), x0 * 1.0001);
  float bracket = x - x0 - 1.5 * a * log(x / x0)
    - rootTerm(uRoots.y, uRoots.z, uRoots.w, x, a)
    - rootTerm(uRoots.z, uRoots.y, uRoots.w, x, a)
    - rootTerm(uRoots.w, uRoots.y, uRoots.z, x, a);
  return max(bracket, 0.0) / (x * x * x * x * (x * x * x - 3.0 * x + 2.0 * a));
}

// Disk emission at a crossing of the equatorial plane. Matter on a prograde
// circular Kerr orbit has angular velocity W = 1 / (r^1.5 + a) and time
// dilation u^t, so a photon with angular momentum L reaches infinity with
// g = 1 / (u^t (1 - W L)): one factor covering Doppler and gravitational shift.
// Observed bolometric intensity is g^4 times the emitted flux, and the observed
// temperature is g times the local one (T ~ flux^(1/4)), so the stored value
// g^4 F also carries the colour.
void record(float radius, float angle) {
  float edge = smoothstep(uRIn, uRIn + 0.7, radius)
    * (1.0 - smoothstep(uROut * 0.35, uROut, radius));
  if (edge <= 0.001) return;

  float flux = novikovThorneFlux(radius) * uFluxNorm;
  float r15 = radius * sqrt(radius);
  float root = max(r15 - 3.0 * sqrt(radius) + 2.0 * uSpin, 0.05);
  float timeDilation = (r15 + uSpin) / (sqrt(r15) * sqrt(root));
  float omega = 1.0 / (r15 + uSpin);
  float redshift = clamp(1.0 / (timeDilation * (1.0 - omega * gL)), 0.05, 2.0);
  float textureAngle = angle;
  textureAngle -= TAU * floor((textureAngle + PI) / TAU);
  int base = gCount * 5;

  gData[base] = clamp((radius - TEX_MIN) / TEX_STEP, 0.0, TEXTURE_RADII - 1.001);
  gData[base + 1] = textureAngle;
  gData[base + 2] = pow(uRIn / radius, SHEAR);
  gData[base + 3] = flux * pow(redshift, 4.0) * edge;
  gData[base + 4] = edge;
  gCount += 1;
}

// Radial part: with u = 1/r and ' = d/d(Mino time), (u')^2 = U(u) for Kerr null
// geodesics, so u'' = U'/2 needs no turning-point logic.
float dU(float u) {
  float u2 = u * u;
  return 4.0 * gC * u * (1.0 + gC * u2)
    - gK * (2.0 * u - 6.0 * u2 + 4.0 * uSpin * uSpin * u * u2);
}

// Azimuth gained from the radial motion (frame dragging), traced backwards.
// The rest of the azimuth comes from the angular direction vector below.
float dExtra(float u) {
  float ratio = (1.0 + gC * u * u) / (1.0 - 2.0 * u + uSpin * uSpin * u * u);
  return uSpin * (1.0 - ratio);
}

// Angular part: the direction n on the unit sphere moves like a particle in the
// potential -a^2 mu^2 / 2 (mu = n.z). Integrating the 3D vector instead of
// (theta, phi) avoids the L / sin^2(theta) singularity at the poles, which made
// rays passing near the spin axis numerically unstable.
vec3 angularAccel(vec3 n, vec3 v) {
  float mu = n.z;
  return -dot(v, v) * n + uSpin * uSpin * mu * (vec3(0.0, 0.0, 1.0) - mu * n);
}

void traceRay(vec2 screen, float cosObs, float sinObs) {
  float alpha = screen.x;
  float beta = screen.y;
  if (alpha * alpha + beta * beta < 1e-6) return;

  gL = -alpha * sinObs;
  float q = beta * beta + cosObs * cosObs * (alpha * alpha - uSpin * uSpin);
  gC = uSpin * uSpin - uSpin * gL;
  gK = (gL - uSpin) * (gL - uSpin) + q;
  // |dn/ds|^2 = alpha^2 + beta^2 + a^2 (mu^2 - mu0^2), kept exact after every step.
  float speedBase = alpha * alpha + beta * beta - uSpin * uSpin * cosObs * cosObs;

  float u = 0.0;
  float vu = 1.0;
  vec3 n = vec3(sinObs, 0.0, cosObs);
  vec3 v = vec3(-beta * cosObs, alpha, beta * sinObs);
  float extra = 0.0;
  float nearCount = 0.0;

  for (int iter = 0; iter < MAX_STEPS; iter += 1) {
    float rate = max(sqrt(dot(v, v)), abs(dExtra(u)));
    float h = min(STEP_MAX, PHI_PER_STEP / max(rate, 1e-3));

    float u1 = vu;
    float w1 = 0.5 * dU(u);
    vec3 a1 = angularAccel(n, v);
    float e1 = dExtra(u);

    float uB = u + 0.5 * h * u1;
    float vuB = vu + 0.5 * h * w1;
    vec3 nB = n + 0.5 * h * v;
    vec3 vB = v + 0.5 * h * a1;
    float u2 = vuB;
    float w2 = 0.5 * dU(uB);
    vec3 a2 = angularAccel(nB, vB);
    float e2 = dExtra(uB);

    float uC = u + 0.5 * h * u2;
    float vuC = vu + 0.5 * h * w2;
    vec3 nC = n + 0.5 * h * vB;
    vec3 vC = v + 0.5 * h * a2;
    float u3 = vuC;
    float w3 = 0.5 * dU(uC);
    vec3 a3 = angularAccel(nC, vC);
    float e3 = dExtra(uC);

    float uD = u + h * u3;
    float vuD = vu + h * w3;
    vec3 nD = n + h * vC;
    vec3 vD = v + h * a3;
    float u4 = vuD;
    float w4 = 0.5 * dU(uD);
    vec3 a4 = angularAccel(nD, vD);
    float e4 = dExtra(uD);

    float nextU = u + h / 6.0 * (u1 + 2.0 * u2 + 2.0 * u3 + u4);
    float nextVu = vu + h / 6.0 * (w1 + 2.0 * w2 + 2.0 * w3 + w4);
    vec3 nextN = normalize(n + h / 6.0 * (v + 2.0 * vB + 2.0 * vC + vD));
    vec3 nextV = v + h / 6.0 * (a1 + 2.0 * a2 + 2.0 * a3 + a4);
    nextV -= nextN * dot(nextN, nextV);
    float speed2 = speedBase + uSpin * uSpin * nextN.z * nextN.z;
    nextV = normalize(nextV) * sqrt(max(speed2, 1e-6));
    float nextExtra = extra + h / 6.0 * (e1 + 2.0 * e2 + 2.0 * e3 + e4);

    if (n.z * nextN.z < 0.0) {
      float fraction = n.z / (n.z - nextN.z);
      float crossingU = u + fraction * (nextU - u);
      if (crossingU > 0.0) {
        float radius = 1.0 / crossingU;
        if (radius > uRIn - 0.2 && radius < uROut) {
          vec3 crossing = mix(n, nextN, fraction);
          record(radius, atan(crossing.y, crossing.x) + mix(extra, nextExtra, fraction));
          if (gCount >= ${MAX_CROSSINGS}) return;
        }
      }
    }

    if (nextU >= uCapture) return;
    if (nextU <= 0.0) {
      gData[15] = nearCount;
      return;
    }
    if (nextU > 0.25) nearCount += 1.0;
    u = nextU;
    vu = nextVu;
    n = nextN;
    v = nextV;
    extra = nextExtra;
  }
}


void main() {
  for (int i = 0; i < 16; i += 1) gData[i] = 0.0;
  traceRay(rayCoord(pixelCoord(), uUnit), cos(uIncl), sin(uIncl));
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
uniform float uPeakTemp;
out vec4 outColor;

// Blackbody colour (Tanner Helland's fit to the Planckian locus, 1000-40000 K),
// scaled so the brightest channel is 1.
vec3 blackbody(float kelvin) {
  float t = clamp(kelvin, 1000.0, 40000.0) / 100.0;
  float r = t <= 66.0 ? 1.0 : 329.698727446 * pow(max(t - 60.0, 1.0), -0.1332047592) / 255.0;
  float g = t <= 66.0
    ? (99.4708025861 * log(t) - 161.1195681661) / 255.0
    : 288.1221695283 * pow(max(t - 60.0, 1.0), -0.0755148492) / 255.0;
  float b = t >= 66.0 ? 1.0 : t <= 19.0 ? 0.0 : (138.5177312231 * log(max(t - 10.0, 1.0)) - 305.0447927307) / 255.0;
  return clamp(vec3(r, g, b), 0.0, 1.0);
}

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

  vec3 diskLight = vec3(0.0);
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
    // g^4 F = (observed temperature / peak temperature)^4, with the edge fade removed
    float temperature = uPeakTemp * sqrt(sqrt(g[k + 3] / edge));
    diskLight += transmittance * opacity * g[k + 3] * disk.r * blackbody(temperature);
    transmittance *= 1.0 - opacity;
    if (transmittance < 0.02) break;
  }

  vec2 pix = pixelCoord();
  // Photon ring: rays that escape after winding around the hole near the photon
  // orbit, measured by how many steps they spent close in (g[15]). Their shape
  // follows the Kerr shadow rather than a fixed circle.
  float added = 0.8 * smoothstep(60.0, 220.0, g[15]);
  float shadowDistance = length(pix - vec2(CX, CY));
  added += 0.012 + 0.05 * exp(-shadowDistance / (uShadowPx * 2.0))
    * (shadowDistance > uShadowPx ? 1.0 : 0.1);
  float vignetteX = max(0.0, (W * 0.4 - pix.x) / (W * 0.4));
  float vignetteY = max(0.0, (pix.y - H * 0.8) / (H * 0.4));
  float vignette = 1.0 - 0.5 * clamp(vignetteX * 0.8 + vignetteY, 0.0, 1.0);

  vec3 disk = 1.0 - exp(-diskLight * uBrightness * vignette * ${f(DISK_EXPOSURE)});
  outColor = vec4(min(palette(added * vignette) + disk, vec3(1.0)), 1.0);
}
`

const COMPOSITE_SOURCE = `${SHADER_HEAD}
uniform sampler2D uScene;
uniform float uBloom;
uniform float uShadowPx;
uniform float uHorizonPx;
uniform float uSunPx;
uniform float uEarthPx;
uniform float uSolarSystemPx;
out vec4 outColor;

uniform sampler2D uBlurA;
uniform sampler2D uBlurB;
uniform sampler2D uBlurC;

float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

vec3 sceneTap(vec2 uv) {
  return textureLod(uScene, uv, 0.0).rgb;
}

// FXAA (Lottes, NVIDIA): every pixel is traced with one ray, so the lensed disk
// and the shadow boundary are hard on/off steps. This blends along strong edges
// only, leaving the disk texture untouched.
vec3 sceneAA(vec2 uv) {
  vec2 px = 1.0 / vec2(W, H);
  vec3 rgbM = sceneTap(uv);
  vec3 rgbNW = sceneTap(uv + vec2(-1.0, -1.0) * px);
  vec3 rgbNE = sceneTap(uv + vec2(1.0, -1.0) * px);
  vec3 rgbSW = sceneTap(uv + vec2(-1.0, 1.0) * px);
  vec3 rgbSE = sceneTap(uv + vec2(1.0, 1.0) * px);
  float lumaM = luma(rgbM);
  float lumaNW = luma(rgbNW);
  float lumaNE = luma(rgbNE);
  float lumaSW = luma(rgbSW);
  float lumaSE = luma(rgbSE);
  float lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));
  float lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));
  if (lumaMax - lumaMin < max(0.03, lumaMax * 0.2)) return rgbM;

  vec2 dir = vec2(-((lumaNW + lumaNE) - (lumaSW + lumaSE)), (lumaNW + lumaSW) - (lumaNE + lumaSE));
  float dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) * 0.03125, 1.0 / 128.0);
  dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + dirReduce), vec2(-3.0), vec2(3.0)) * px;
  vec3 rgbA = 0.5 * (sceneTap(uv + dir * (1.0 / 3.0 - 0.5)) + sceneTap(uv + dir * (2.0 / 3.0 - 0.5)));
  vec3 rgbB = 0.5 * rgbA + 0.25 * (sceneTap(uv - 0.5 * dir) + sceneTap(uv + 0.5 * dir));
  float lumaB = luma(rgbB);
  return (lumaB < lumaMin || lumaB > lumaMax) ? rgbA : rgbB;
}

void main() {
  vec2 uv = gl_FragCoord.xy / vec2(W, H);
  vec3 color = sceneAA(uv);
  if (uBloom > 0.0) {
    color += uBloom * 0.45 * texture(uBlurA, uv).rgb;
    color += uBloom * 0.55 * texture(uBlurB, uv).rgb;
    float t = length(pixelCoord() - vec2(CX, CY + uShadowPx * 0.95)) / (uShadowPx * 1.5);
    float mask = t < 0.5 ? 1.0 - 0.8 * t : max(0.0, 0.6 - 1.2 * (t - 0.5));
    color += uBloom * 4.0 * mask * texture(uBlurC, uv).rgb;
  }
  if (uHorizonPx > 0.0) {
    // 1px ring at the event horizon's coordinate radius (1 M = one unit of screen scale)
    float ring = abs(length(pixelCoord() - vec2(CX, CY)) - uHorizonPx);
    color = mix(color, vec3(0.45, 0.85, 1.0), clamp(1.0 - ring, 0.0, 1.0));
  }
  if (uSunPx > 0.0) {
    // 1px yellow ring at the Sun's true radius, same scale as the horizon ring
    float ring = abs(length(pixelCoord() - vec2(CX, CY)) - uSunPx);
    color = mix(color, vec3(1.0, 0.85, 0.15), clamp(1.0 - ring, 0.0, 1.0));
  }
  if (uEarthPx > 0.0) {
    // 1px violet ring at the Earth's radius, same scale again
    float ring = abs(length(pixelCoord() - vec2(CX, CY)) - uEarthPx);
    color = mix(color, vec3(0.8, 0.6, 1.0), clamp(1.0 - ring, 0.0, 1.0));
  }
  if (uSolarSystemPx > 0.0) {
    // 1px green ring at Neptune's orbit, same scale again
    float ring = abs(length(pixelCoord() - vec2(CX, CY)) - uSolarSystemPx);
    color = mix(color, vec3(0.4, 1.0, 0.5), clamp(1.0 - ring, 0.0, 1.0));
  }
  float n1 = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float n2 = fract(sin(dot(gl_FragCoord.xy + vec2(19.19, 7.7), vec2(12.9898, 78.233))) * 43758.5453);
  color += (n1 + n2 - 1.0) / 255.0;
  outColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`

const FILTER_HEAD = `#version 300 es
precision highp float;
uniform sampler2D uSource;
uniform vec2 uSize;
out vec4 outColor;
`

// Averages a 4x4 block per output pixel (four bilinear taps), halving or
// quartering the resolution without aliasing.
const DOWNSAMPLE_SOURCE = `${FILTER_HEAD}
uniform vec2 uOffset;
void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  outColor = 0.25 * (
    texture(uSource, uv + vec2(-uOffset.x, -uOffset.y))
    + texture(uSource, uv + vec2(uOffset.x, -uOffset.y))
    + texture(uSource, uv + vec2(-uOffset.x, uOffset.y))
    + texture(uSource, uv + vec2(uOffset.x, uOffset.y)));
}
`

// One axis of a Gaussian; sigma is in texels of the (same-sized) source.
const BLUR_SOURCE = `${FILTER_HEAD}
uniform vec2 uStep;
uniform float uSigma;
void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  vec4 sum = vec4(0.0);
  float total = 0.0;
  for (int i = -${BLOOM_TAPS}; i <= ${BLOOM_TAPS}; i += 1) {
    float weight = exp(-0.5 * float(i * i) / (uSigma * uSigma));
    sum += weight * texture(uSource, uv + float(i) * uStep);
    total += weight;
  }
  outColor = sum / total;
}
`

onMounted(() => {
  updateViewport()
  window.addEventListener('resize', updateViewport)
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
      fpsStart = time
      tick(time)
    })
  }, 30)
})

onBeforeUnmount(() => {
  mounted = false
  window.removeEventListener('resize', updateViewport)
  cancelReset()
  window.clearTimeout(timer)
  window.cancelAnimationFrame(frame)
  gl?.getExtension('WEBGL_lose_context')?.loseContext()
})

// Dragging with the left button rotates the view: horizontal drag changes yaw,
// vertical drag changes pitch (the same values as the sliders).
const DRAG_DEGREES_PER_PX = 0.3
const dragging = ref(false)
let dragX = 0
let dragY = 0
let dragYaw = 0
let dragPitch = 0

function startDrag(event) {
  if (event.button !== 0 || controlsDisabled.value) return
  cancelReset()
  dragging.value = true
  dragX = event.clientX
  dragY = event.clientY
  dragYaw = yaw.value
  dragPitch = pitch.value
  event.currentTarget.setPointerCapture(event.pointerId)
}

function dragMove(event) {
  if (!dragging.value) return
  yaw.value = Math.round(clamp(dragYaw + (event.clientX - dragX) * DRAG_DEGREES_PER_PX, -90, 90))
  pitch.value = Math.round(clamp(dragPitch - (event.clientY - dragY) * DRAG_DEGREES_PER_PX, 0, 89))
}

function endDrag(event) {
  if (!dragging.value) return
  dragging.value = false
  event.currentTarget.releasePointerCapture?.(event.pointerId)
}

// The scroll wheel zooms (same range as the slider): up zooms in, down zooms out.
const WHEEL_ZOOM_PER_PX = 0.0005
function wheelZoom(event) {
  if (controlsDisabled.value) return
  cancelReset()
  // deltaMode 1 is lines, not pixels
  const delta = event.deltaY * (event.deltaMode === 1 ? 33 : 1)
  zoom.value = Math.round(clamp(zoom.value - delta * WHEEL_ZOOM_PER_PX, 0.35, 1.5) * 100) / 100
}

// Reset eases every value back to its default. Detail and contrast rebuild the
// disk texture, so they jump at the end instead of animating.
const RESET_MS = 800
const RESET_KEYS = {
  bloom, speed, zoom, massLog, temperature, brightness, roll, pitch, yaw, rIn, rOut, spin,
}
let resetFrame = 0
let resetting = false

function cancelReset() {
  window.cancelAnimationFrame(resetFrame)
  resetting = false
}

function resetControls() {
  cancelReset()
  showHorizon.value = DEFAULTS.showHorizon
  showSun.value = DEFAULTS.showSun
  showEarth.value = DEFAULTS.showEarth
  showSolarSystem.value = DEFAULTS.showSolarSystem
  const from = Object.fromEntries(Object.entries(RESET_KEYS).map(([key, control]) => [key, control.value]))
  const fromX = centerX
  const fromY = centerY
  let start = null
  resetting = true

  const step = (now) => {
    if (!resetting || !mounted) return
    start ??= now
    const t = Math.min(1, (now - start) / RESET_MS)
    const eased = 1 - (1 - t) ** 3
    for (const [key, control] of Object.entries(RESET_KEYS)) {
      control.value = from[key] + (DEFAULTS[key] - from[key]) * eased
    }
    moveHole(fromX + (CX - fromX) * eased, fromY + (CY - fromY) * eased)
    if (t < 1) {
      resetFrame = window.requestAnimationFrame(step)
      return
    }
    resetting = false
    detail.value = DEFAULTS.detail
    contrast.value = DEFAULTS.contrast
    rebuildDiskTexture()
  }
  resetFrame = window.requestAnimationFrame(step)
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
    incl: clamp(Math.acos(clamp(normalZ, -1, 1)), MIN_INCL, MAX_INCL),
    tilt: Math.atan2(-normalX, normalY) + roll.value * Math.PI / 180,
  }
}

function moveHole(x, y) {
  centerX = x
  centerY = y
  needsTrace = true
  dirty = true
}

function hash(x, y, z) {
  let value = x * 374761393 + y * 668265263 + z * 2246822519
  value = (value ^ (value >>> 13)) * 1274126177
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295
}

function valueNoise(x, y, z) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const zi = Math.floor(z)
  const xf = x - xi
  const yf = y - yi
  const zf = z - zi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const w = zf * zf * (3 - 2 * zf)
  const lerp = (a, b, t) => a + (b - a) * t
  const plane = (dz) => lerp(
    lerp(hash(xi, yi, zi + dz), hash(xi + 1, yi, zi + dz), u),
    lerp(hash(xi, yi + 1, zi + dz), hash(xi + 1, yi + 1, zi + dz), u),
    v,
  )
  return lerp(plane(0), plane(1), w)
}

function fbm(x, y, z) {
  let sum = 0
  let amplitude = 0.5
  for (let i = 0; i < 5; i += 1) {
    sum += amplitude * valueNoise(x, y, z)
    x = x * 2.03 + 11.7
    y = y * 2.03 + 3.1
    z = z * 2.03 + 7.3
    amplitude *= 0.5
  }
  return sum
}

// The angle is sampled on a circle of radius `frequency` (same feature density as
// angle * frequency), so the noise wraps at +/-PI with no seam.
function periodicFbm(angle, frequency, radius) {
  return fbm(Math.cos(angle) * frequency, Math.sin(angle) * frequency, radius)
}

function periodicNoise(angle, frequency, radius) {
  return valueNoise(Math.cos(angle) * frequency, Math.sin(angle) * frequency, radius)
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

function createTexture(internalFormat, format, type, data, filter, mipmaps = false, size = [WIDTH, HEIGHT]) {
  const texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texture)
  const width = data ? TEXTURE_ANGLES : size[0]
  const height = data ? TEXTURE_RADII : size[1]
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
  downsampleProgram = createProgram(DOWNSAMPLE_SOURCE)
  blurProgram = createProgram(BLUR_SOURCE)

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

  sceneTexture = createTexture(gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, null, gl.LINEAR)
  sceneFramebuffer = gl.createFramebuffer()
  gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFramebuffer)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sceneTexture, 0)
  checkFramebuffer('Scene')

  for (const level of new Set(BLOOM_LEVELS)) {
    const size = [Math.ceil(WIDTH / 2 ** level), Math.ceil(HEIGHT / 2 ** level)]
    bloomLevels[level] = { down: createTarget(size), scratch: createTarget(size) }
  }
  bloomTargets = BLOOM_LEVELS.map(level => createTarget([bloomLevels[level].down.width, bloomLevels[level].down.height]))
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
}

function createTarget(size) {
  const texture = createTexture(gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, null, gl.LINEAR, false, size)
  const framebuffer = gl.createFramebuffer()
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
  checkFramebuffer('Bloom')
  return { texture, framebuffer, width: size[0], height: size[1] }
}

function bindTexture(slot, texture) {
  gl.activeTexture(gl.TEXTURE0 + slot)
  gl.bindTexture(gl.TEXTURE_2D, texture)
}

function drawPass(framebuffer, width = WIDTH, height = HEIGHT) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
  gl.viewport(0, 0, width, height)
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

function traceRays() {
  gl.useProgram(traceProgram.program)
  gl.uniform2f(traceProgram.uniforms.uCenter, centerX, centerY)
  const view = viewAngles()
  gl.uniform1f(traceProgram.uniforms.uTilt, view.tilt)
  gl.uniform1f(traceProgram.uniforms.uIncl, view.incl)
  gl.uniform1f(traceProgram.uniforms.uUnit, unit)
  gl.uniform1f(traceProgram.uniforms.uRIn, innerRadius.value)
  gl.uniform1f(traceProgram.uniforms.uROut, rOut.value)
  gl.uniform1f(traceProgram.uniforms.uSpin, spin.value)
  const fluxSpin = Math.max(spin.value, 0.001)
  const roots = fluxRoots(fluxSpin)
  gl.uniform4f(traceProgram.uniforms.uRoots, ...roots)
  gl.uniform1f(traceProgram.uniforms.uFluxNorm, 1 / (peakDiskFlux(fluxSpin, roots) || 1))
  const horizon = 1 + Math.sqrt(1 - spin.value * spin.value)
  gl.uniform1f(traceProgram.uniforms.uCapture, 1 / (horizon + HORIZON_MARGIN))
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
  gl.uniform1f(uniforms.uPeakTemp, PEAK_TEMP_WARM + (PEAK_TEMP_COOL - PEAK_TEMP_WARM) * temperature.value)
  drawPass(sceneFramebuffer)
}

function downsample(sourceTexture, source, target, offset) {
  const { program, uniforms } = downsampleProgram
  gl.useProgram(program)
  bindTexture(0, sourceTexture)
  gl.uniform1i(uniforms.uSource, 0)
  gl.uniform2f(uniforms.uSize, target.width, target.height)
  gl.uniform2f(uniforms.uOffset, offset / source.width, offset / source.height)
  drawPass(target.framebuffer, target.width, target.height)
}

function blurAxis(source, target, vertical, sigma) {
  const { program, uniforms } = blurProgram
  gl.useProgram(program)
  bindTexture(0, source.texture)
  gl.uniform1i(uniforms.uSource, 0)
  gl.uniform2f(uniforms.uSize, target.width, target.height)
  gl.uniform2f(uniforms.uStep, vertical ? 0 : 1 / target.width, vertical ? 1 / target.height : 0)
  gl.uniform1f(uniforms.uSigma, sigma)
  drawPass(target.framebuffer, target.width, target.height)
}

function renderBloom() {
  const full = { width: WIDTH, height: HEIGHT }
  const quarter = bloomLevels[2].down
  const eighth = bloomLevels[3].down
  downsample(sceneTexture, full, quarter, 1)
  downsample(quarter.texture, quarter, eighth, 0.5)
  BLOOM_RADII.forEach((radius, index) => {
    const level = bloomLevels[BLOOM_LEVELS[index]]
    const sigma = radius * BLOOM_SIGMA_SCALE / 2 ** BLOOM_LEVELS[index]
    blurAxis(level.down, level.scratch, false, sigma)
    blurAxis(level.scratch, bloomTargets[index], true, sigma)
  })
}

function compositeScene() {
  const { program, uniforms } = compositeProgram
  gl.useProgram(program)
  bindTexture(0, sceneTexture)
  gl.uniform1i(uniforms.uScene, 0)
  ;['uBlurA', 'uBlurB', 'uBlurC'].forEach((name, index) => {
    bindTexture(index + 1, bloomTargets[index].texture)
    gl.uniform1i(uniforms[name], index + 1)
  })
  gl.uniform2f(uniforms.uCenter, centerX, centerY)
  gl.uniform1f(uniforms.uBloom, bloom.value)
  gl.uniform1f(uniforms.uShadowPx, shadowPx)
  gl.uniform1f(uniforms.uHorizonPx, showHorizon.value ? horizonRadius.value * unit : 0)
  gl.uniform1f(uniforms.uSunPx, showSun.value ? sunRadius.value * unit : 0)
  gl.uniform1f(uniforms.uEarthPx, showEarth.value ? earthRadius.value * unit : 0)
  gl.uniform1f(uniforms.uSolarSystemPx, showSolarSystem.value ? solarSystemRadius.value * unit : 0)
  drawPass(null)
}

function drawFrame() {
  if (needsTrace) {
    traceRays()
    needsTrace = false
  }
  shadeScene()
  if (bloom.value > 0) renderBloom()
  compositeScene()
}

function tick(now) {
  if (!mounted) return
  const delta = Math.min(0.1, (now - lastFrameTime) / 1000)
  lastFrameTime = now
  const spinning = speed.value > 0
  if (spinning) spinTime += delta * speed.value
  if (spinning || dirty) {
    drawFrame()
    dirty = false
    fpsFrames += 1
  }
  if (now - fpsStart >= FPS_INTERVAL) {
    fps.value = Math.round(fpsFrames * 1000 / (now - fpsStart))
    fpsFrames = 0
    fpsStart = now
  }
  frame = window.requestAnimationFrame(tick)
}
</script>
