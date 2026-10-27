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
              <ControlSlider v-model="spin" label="Spin a/M" hint="Spin of the black hole, a/M, from 0 (not rotating) to 0.998 (nearly the maximum), or up to 1.5 with Allow spin above 1. More spin drags space around, shrinks the horizon, moves the disk's inner edge closer and flattens the shadow." :min="0" :max="spinMax" :step="0.002" :display="spin.toFixed(3)" :disabled="controlsDisabled" />
              <ControlSlider v-model="accretionLog" label="Accretion rate" hint="How fast matter falls into the hole, as a share of the Eddington rate: the rate at which the radiation it gives off would push back as hard as gravity pulls in. It is not the mass of the disk. Relativistic jets switch on when it drops below about 2% of the Eddington rate, and need a fast spin; at higher rates the disk is thin and the jets are suppressed. Logarithmic, from 0.1% to 100%." :min="-3" :max="0" :step="0.05" :display="formatRate(accretionRate)" :disabled="controlsDisabled" />
              <UTooltip :ui="tipUi" text="Draw the relativistic jets: beams of plasma launched along the spin axis, up and down. The one pointing towards you is Doppler beamed, so it looks much brighter and bluer than the one pointing away. They only show when the accretion rate is low enough (below about 2% of Eddington) and the spin is high. They are drawn with the same bent light rays as the rest, so the far jet is lensed too.">
                <UCheckbox v-model="showJets" label="Show relativistic jets" :disabled="controlsDisabled" />
              </UTooltip>
              <UBadge class="sm:col-span-2" color="neutral" variant="subtle" role="status">{{ jetStatus }}</UBadge>
              <UTooltip text="Size of the event horizon (the point of no return) for the chosen mass and spin. It shrinks as the spin grows.">
                <UBadge color="neutral" variant="subtle">{{ isNaked ? 'No event horizon' : `Horizon radius ${formatLength(horizonKm)}` }}</UBadge>
              </UTooltip>
              <UTooltip :ui="tipUi" text="Let the Spin slider go past 1, up to 1.5. A real black hole cannot spin faster than a/M = 1; beyond it the horizon disappears and a naked singularity is left. This is an experiment with approximations, not physics: it has no horizon, so light is simply discarded very close in, and the disk keeps the profile of the fastest physical spin.">
                <UCheckbox v-model="allowNaked" label="Allow spin above 1 (not physical)" :disabled="controlsDisabled" />
              </UTooltip>
              <UAlert
                v-if="isNaked"
                class="sm:col-span-2"
                color="warning"
                variant="subtle"
                icon="i-lucide-triangle-alert"
                title="Naked singularity, not physical"
                description="Above a/M = 1 there is no event horizon. Light is discarded close to the centre and the disk uses the profile of the fastest physical spin, so this picture is an approximation."
              />
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
              <ControlSlider v-model="orbit" label="Orbit velocity" hint="How fast the disk matter really orbits, as a multiple of the physical (Keplerian) speed, which is fixed by the radius and the spin. Above 1 is an exaggeration, capped so no matter outruns light: it strengthens the Doppler shift, the beaming of the approaching side and the time dilation, so the two sides differ more in colour and brightness. At 0 only the gravitational redshift is left. Unlike Speed, this changes the picture, not just the animation." :min="0" :max="2" :step="0.05" :display="`×${orbit.toFixed(2)}`" :disabled="controlsDisabled" />
              <ControlSlider v-model="temperature" label="Temperature" hint="Temperature of the disk at its brightest ring, from about 3,500 K (orange) to 10,000 K (blue-white). Every other part is coloured from this using the disk model, Doppler shift and redshift." :min="0" :max="1" :step="0.01" :display="`${Math.round(3500 + 6500 * temperature)}K`" :disabled="controlsDisabled" />
              <ControlSlider v-model="brightness" label="Brightness" hint="Exposure of the accretion disk. It changes how bright the disk looks, not its temperature or colour." :min="0" :max="3" :step="0.1" :display="brightness.toFixed(1)" :disabled="controlsDisabled" />
              <ControlSlider v-model="rIn" label="R in" hint="Inner edge of the disk, in units of GM/c². It cannot go inside the innermost stable orbit, which depends on the spin, so this only moves the edge outwards; the value shown is the edge in use." :min="R_IN_MIN" :max="6" :step="0.1" :display="innerRadius.toFixed(1)" :disabled="controlsDisabled" />
              <ControlSlider v-model="rOut" label="R out" hint="Outer edge of the disk, in units of GM/c². The disk fades out towards this radius." :min="18" :max="88" :step="1" :display="`${Math.round(rOut)}`" :disabled="controlsDisabled" />
              <ControlSlider v-model="detail" label="Detail" hint="Size of the clumps in the disk texture: higher gives finer, more numerous structure. Rebuilds the thin disk's texture when released; the volumetric gas follows it live." :min="1" :max="12" :step="0.5" :display="detail.toFixed(1)" :disabled="controlsDisabled" @change="rebuildDiskTexture" />
              <ControlSlider v-model="contrast" label="Contrast" hint="How strongly the clumps stand out from the smooth disk. Rebuilds the thin disk's texture when released; the volumetric gas follows it live." :min="0.5" :max="3" :step="0.1" :display="contrast.toFixed(1)" :disabled="controlsDisabled" @change="rebuildDiskTexture" />
              <UTooltip :ui="tipUi" text="Draw the disk as a volume of glowing, absorbing gas and dust with real thickness, instead of a thin sheet. The light is followed through the gas along its bent path, so you can see through thin gas, dense lanes block the light behind them, and the far side of the disk shows over and under the hole. It costs much more to draw and redraws every frame; turn it off for the thin disk.">
                <UCheckbox v-model="volumetric" label="Volumetric gas and dust" :disabled="controlsDisabled" />
              </UTooltip>
              <ControlSlider v-model="thickness" label="Thickness" hint="Height of the gas above and below the disk plane, as a fraction of the distance from the hole. The disk flares: it is thicker further out. The total amount of gas does not change, so a thicker disk is more diffuse." :min="0.01" :max="0.35" :step="0.01" :display="`${Math.round(thickness * 100)}%`" :disabled="controlsDisabled || !volumetric" />
              <ControlSlider v-model="density" label="Density" hint="How much gas there is, which is how opaque the volume is. Low values let you see through to the far side; high values make it a dense, dark-laned cloud that only shows its surface." :min="0.2" :max="4" :step="0.1" :display="density.toFixed(1)" :disabled="controlsDisabled || !volumetric" />
              <ControlSlider v-model="quality" label="Volume quality" hint="Resolution of the gas, as a share of the picture. Lower is faster and softer. Rebuilds the target when released." :min="0.25" :max="1" :step="0.05" :display="`${Math.round(quality * 100)}%`" :disabled="controlsDisabled || !volumetric" @change="resizeVolume" />
              <UTooltip :ui="tipUi" text="Put a body with the Sun's true radius (695,700 km) in the disk, orbiting with the gas. It is drawn with the same bent light rays, so its far side is lensed over and under the hole, it hides the disk behind it, and the side moving towards you is brighter and bluer. At the same scale as the rings it is tiny for a heavy hole and huge for a light one. It is drawn by the volume pass, which redraws every frame.">
                <UCheckbox v-model="showOrbiter" label="Orbiting Sun" :disabled="controlsDisabled" />
              </UTooltip>
              <UTooltip :ui="tipUi" text="Put a body with the Earth's true radius (6,371 km) beside the Sun, at the same orbit radius and 1 AU ahead of it along the orbit. The Earth gives no light of its own next to the disk, so it is a dark silhouette: lensed like everything else, and hiding the disk behind it. At the Sun's scale it is about 1/109 as wide, so it only becomes visible for a light hole. It is drawn by the volume pass, which redraws every frame.">
                <UCheckbox v-model="showOrbiterEarth" label="Orbiting Earth" :disabled="controlsDisabled" />
              </UTooltip>
              <ControlSlider v-model="orbiterOrbit" label="Sun and Earth orbit" hint="Radius of the circular orbit of the Sun and the Earth in GM/c², from the disk's inner edge outwards. They ride just above the disk plane and turn with the disk at that radius: the closer in, the faster." :min="R_IN_MIN" :max="R_OUT_MAX" :step="0.5" :display="`${orbiterRadius.toFixed(1)} M`" :disabled="controlsDisabled || !(showOrbiter || showOrbiterEarth)" />
              <UBadge v-if="showOrbiter" class="sm:col-span-2" color="neutral" variant="subtle" role="status">{{ orbiterStatus }}</UBadge>
              <UBadge v-if="showOrbiterEarth" class="sm:col-span-2" color="neutral" variant="subtle" role="status">{{ earthStatus }}</UBadge>
            </div>
          </template>
          <template #display>
            <div class="grid gap-x-8 gap-y-4 pt-3 md:grid-cols-2 xl:grid-cols-4">
              <div class="space-y-3">
                <USeparator label="Colour and glow" />
                <UTooltip :ui="tipUi" text="Draw a field of stars far behind the hole. Each pixel's light ray ends up pointing at some part of the sky once gravity has bent it, so the stars show the lensing: they are stretched into arcs and a ring around the shadow, and the hole itself shows none, since that light fell in. Dense gas in front hides them. The stars are made up, and the field of view is a choice; the bending is the real one.">
                  <UCheckbox v-model="showStars" label="Show starfield" :disabled="controlsDisabled || !starsAvailable" />
                </UTooltip>
                <ControlSlider v-model="starAmount" label="Star amount" hint="How many stars there are, from none to the full field. Turning it down thins the stars out without changing how bright the rest are." :min="0" :max="1" :step="0.02" :display="`${Math.round(starAmount * 100)}%`" :disabled="controlsDisabled || !showStars || !starsAvailable" />
                <ControlSlider v-model="starBrightness" label="Star brightness" hint="How bright the stars are. Bloom makes the brighter ones glow." :min="0.2" :max="3" :step="0.1" :display="starBrightness.toFixed(1)" :disabled="controlsDisabled || !showStars || !starsAvailable" />
                <ControlSlider v-model="bloom" label="Bloom" hint="Strength of the glow around bright areas. Purely cosmetic; 0 turns it off." :min="0" :max="2" :step="0.05" :display="bloom.toFixed(2)" :disabled="controlsDisabled" />
                <UTooltip :ui="tipUi" text="Colour the disk by how much its light is shifted in frequency, instead of by temperature. Red is redshifted (g below 1): matter moving away from you, or deep in the gravitational well. Blue is blueshifted (g above 1): matter moving towards you. White is unshifted. Brightness still includes the relativistic beaming, so the approaching side is bright and blue, the receding side dim and red.">
                  <UCheckbox v-model="showShift" label="Show redshift and blueshift" :disabled="controlsDisabled" />
                </UTooltip>
                <div v-if="showShift" class="space-y-1">
                  <div class="h-2 rounded-full bg-linear-to-r from-red-500 via-white to-blue-400" />
                  <div class="flex justify-between text-xs text-muted">
                    <span>Redshift</span>
                    <span>g = 1</span>
                    <span>Blueshift</span>
                  </div>
                </div>
              </div>
              <div class="space-y-3">
                <USeparator label="Scale rings" />
                <UTooltip :ui="tipUi" text="Draw a thin ring at the true size of the event horizon. The black disc you see is larger: it is the shadow, where light bent by gravity is lost.">
                  <UCheckbox v-model="showHorizon" label="Show event horizon" :disabled="controlsDisabled" />
                </UTooltip>
                <UTooltip :ui="tipUi" text="Draw the circular orbits of light in the equatorial plane, where light can orbit the hole (unstably). For a non-spinning hole this is 3 GM/c², 1.5 times the horizon radius. A spinning hole has two: a smaller one for light moving with the spin and a larger one against it. Like the horizon ring it is drawn at the true coordinate radius; the shadow you see is larger (about 5.2 GM/c²) because it is where light from outside is captured, and the thin bright ring around it is light that has circled near here.">
                  <UCheckbox v-model="showPhoton" label="Show photon sphere" :disabled="controlsDisabled" />
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
              <div class="space-y-3">
                <USeparator label="Rubber sheet" />
                <UTooltip :ui="tipUi" text="Draw the classic rubber-sheet picture: the plane of the disk bent into a funnel (an embedding diagram, Flamm's paraboloid for a non-spinning hole). Distances along the sheet match the curved space, so the funnel shows how space stretches towards the hole. It is a diagram drawn over the picture, not what a camera would see, and for a spinning hole it is only an approximation.">
                  <UCheckbox v-model="showSheet" label="Show rubber sheet" :disabled="controlsDisabled" />
                </UTooltip>
                <ControlSlider v-model="sheetSize" label="Sheet size" hint="Radius of the sheet in units of GM/c², where the event horizon of a non-spinning hole is at 2." :min="8" :max="60" :step="2" :display="`${sheetSize} M`" :disabled="controlsDisabled || !showSheet" />
              </div>
              <div class="space-y-3">
                <USeparator label="Spacetime grid" />
                <UTooltip :ui="tipUi" text="Draw a 3D grid in the hole's coordinate frame (z is the spin axis) and trace its light through the same curved space. Straight lines far away bend, stretch and wrap around the hole, which shows the lensing. The grid is in coordinate space, so it shows how light is bent, not an intrinsic measure of curvature.">
                  <UCheckbox v-model="showGrid" label="Show spacetime grid" :disabled="controlsDisabled" />
                </UTooltip>
                <ControlSlider v-model="gridSize" label="Grid size" hint="Side length of the grid cube in units of GM/c², where the event horizon of a non-spinning hole is at 2. Changing it scales the grid and keeps the number of lines." :min="8" :max="120" :step="2" :display="`${gridSize} M`" :disabled="controlsDisabled || !showGrid" />
                <ControlSlider v-model="gridLines" label="Grid lines" hint="How many cells each side of the grid cube is divided into, so there is one more line than this along each axis. More lines make a finer grid of the same size, but cost more to trace and look busier." :min="2" :max="32" :step="2" :display="`${gridLines}`" :disabled="controlsDisabled || !showGrid" />
                <UTooltip :ui="tipUi" text="Which planes of the grid to draw. X is the plane through the hole where x = 0, Y where y = 0, and Z where z = 0, which is the disk plane (z is the spin axis). Turn on Full 3D grid to repeat each plane through space.">
                  <UFormField label="Grid planes">
                    <div class="flex gap-4">
                      <UCheckbox v-model="showGridX" label="X" :disabled="controlsDisabled || !showGrid" />
                      <UCheckbox v-model="showGridY" label="Y" :disabled="controlsDisabled || !showGrid" />
                      <UCheckbox v-model="showGridZ" label="Z" :disabled="controlsDisabled || !showGrid" />
                    </div>
                  </UFormField>
                </UTooltip>
                <UTooltip :ui="tipUi" text="Repeat each selected plane every grid spacing through space, filling it with a 3D lattice. Off draws only the plane through the hole.">
                  <UCheckbox v-model="showGridStack" label="Full 3D grid" :disabled="controlsDisabled || !showGrid" />
                </UTooltip>
              </div>
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
      :ui="{ content: 'w-[28rem]' }"
      :modal="false"
      :overlay="false"
      :handle="false"
      close
    >
      <template #body>
        <div class="space-y-3 text-sm">
          <UAccordion :items="infoTopics" type="multiple" :default-value="['0']">
            <template #body="{ item }">
              <div class="space-y-2 text-sm text-muted">
                <p v-for="(paragraph, index) in item.paragraphs" :key="index">{{ paragraph }}</p>
              </div>
            </template>
          </UAccordion>
          <p>
            Copyright 2026 Paul Rid<template v-if="contact">
              (<ULink :to="`mailto:${contact}`">{{ contact }}</ULink>)</template>.
          </p>        </div>
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
// With the opt-in option the slider goes past 1, where there is no event horizon (a naked singularity)
const NAKED_MAX_SPIN = 1.5
// Without a horizon rays are given up at this radius instead, in GM/c^2
const NAKED_CAPTURE_RADIUS = 0.7
// Geometric units (G = c = M = 1). Rays are captured just outside the horizon,
// where Boyer-Lindquist coordinates become singular.
const HORIZON_MARGIN = 0.02
const BASE_SHADOW_PX = 122 / 736 * WIDTH
const CX = WIDTH / 2
const CY = HEIGHT / 2
// Relativistic jets along the spin axis. They reach JET_LENGTH from the hole and start JET_BASE above
// it (in GM/c^2); the plasma moves at JET_BETA of the speed of light, its light is a blue-white
// of JET_TEMPERATURE kelvin before the Doppler shift, JET_BRIGHTNESS scales how bright it is, and
// the knots in it move outward at JET_SPEED GM/c^2 per second.
const JET_LENGTH = 80
const JET_BETA = 0.92
const JET_BASE = 1.5
const JET_BRIGHTNESS = 2.5
const JET_TEMPERATURE = 20000
const JET_SPEED = 6
// Jets switch on when the accretion rate falls below this share of the Eddington rate, and are
// gone above twice it
const JET_THRESHOLD = 0.02
// The starfield's vertical field of view in radians, and the size of a star (a Gaussian's sigma in
// radians) which is about a pixel wide at that field of view
const STAR_FOV = 1.2
const STAR_SIGMA = STAR_FOV / HEIGHT * 0.9
// A Sun-sized body orbiting in the disk plane: its surface temperature in kelvin before the
// shift, and how bright it is (scaled by the shift to the fourth power, as the disk is)
const ORBITER_TEMPERATURE = 5772
const ORBITER_LIGHT = 3
// How high its centre rides above the disk plane, in body radii: just clear of the disk
const ORBITER_CLEARANCE = 1.25
const ROLL_SNAP = 2
const MAX_INCL = 89 * Math.PI / 180
const SPIN_RATE = 0.5
// Max shear (radians between inner and outer disk) before the texture is cross-faded back
const SHEAR_CYCLE = 2 * Math.PI
// the disk turns at (rIn / r)^SHEAR times SPIN_RATE; 1.5 is the Keplerian fall-off of the angular
// velocity, so the speed along the orbit rises towards the hole
const SHEAR = 1.5
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
  orbit: 1,
  zoom: 1,
  // log10 of the mass in solar masses; 6.63 is Sagittarius A* (about 4.3 million)
  massLog: 6.63,
  showHorizon: false,
  showSun: false,
  showEarth: false,
  showSolarSystem: false,
  showPhoton: false,
  showGrid: false,
  gridSize: 48,
  gridLines: 8,
  showGridX: true,
  showGridY: true,
  showGridZ: true,
  showGridStack: true,
  showSheet: false,
  showShift: false,
  sheetSize: 16,
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
  showStars: false,
  starBrightness: .4,
  starAmount: .04,
  showJets: false,
  showOrbiter: false,
  showOrbiterEarth: false,
  // orbit radius of the body in GM/c^2
  orbiterOrbit: 12,
  // log10 of the accretion rate as a share of the Eddington rate
  accretionLog: -2,
  volumetric: false,
  // gas scale height as a fraction of the radius
  thickness: 0.03,
  density: 1,
  // render scale of the volume pass
  quality: 0.5,
}

const bloom = ref(DEFAULTS.bloom)
const speed = ref(DEFAULTS.speed)
const orbit = ref(DEFAULTS.orbit)
const zoom = ref(DEFAULTS.zoom)
const massLog = ref(DEFAULTS.massLog)
const showHorizon = ref(DEFAULTS.showHorizon)
const showSun = ref(DEFAULTS.showSun)
const showEarth = ref(DEFAULTS.showEarth)
const showSolarSystem = ref(DEFAULTS.showSolarSystem)
const showPhoton = ref(DEFAULTS.showPhoton)
const allowNaked = ref(false)
const showGrid = ref(DEFAULTS.showGrid)
const gridSize = ref(DEFAULTS.gridSize)
const gridLines = ref(DEFAULTS.gridLines)
const showGridX = ref(DEFAULTS.showGridX)
const showGridY = ref(DEFAULTS.showGridY)
const showGridZ = ref(DEFAULTS.showGridZ)
const showGridStack = ref(DEFAULTS.showGridStack)
const showSheet = ref(DEFAULTS.showSheet)
const showShift = ref(DEFAULTS.showShift)
const sheetSize = ref(DEFAULTS.sheetSize)
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
const showStars = ref(DEFAULTS.showStars)
const starBrightness = ref(DEFAULTS.starBrightness)
const starAmount = ref(DEFAULTS.starAmount)
// Needs a fifth render target; set false at start-up if the GPU has fewer
const starsAvailable = ref(true)
const volumetric = ref(DEFAULTS.volumetric)
const showJets = ref(DEFAULTS.showJets)
const showOrbiter = ref(DEFAULTS.showOrbiter)
const showOrbiterEarth = ref(DEFAULTS.showOrbiterEarth)
const orbiterOrbit = ref(DEFAULTS.orbiterOrbit)
// log10 of the accretion rate as a share of the Eddington rate (-2 is 1%)
const accretionLog = ref(DEFAULTS.accretionLog)
const accretionRate = computed(() => 10 ** accretionLog.value)
// How strong the jets are, 0 to 1. They need the accretion rate to be below JET_THRESHOLD of the
// Eddington rate (they fade out between that and twice it), and a hole that spins fast: the power
// drawn from the spin grows as its square (Blandford-Znajek), so a slow spin gives a weak jet.
const jetStrength = computed(() => {
  if (!showJets.value) return 0
  const fade = clamp((accretionRate.value - JET_THRESHOLD) / JET_THRESHOLD, 0, 1)
  const gate = 1 - fade * fade * (3 - 2 * fade)
  return gate * clamp(spin.value ** 2 / 0.8, 0, 1)
})
// What the jets are doing, for the badge next to the accretion rate
const jetStatus = computed(() => {
  if (!showJets.value) return 'Jets are hidden'
  if (accretionRate.value >= 2 * JET_THRESHOLD) return `Jets off: the rate is above ${Math.round(200 * JET_THRESHOLD)}% of Eddington`
  if (jetStrength.value <= 0.02) return 'Jets off: the hole spins too slowly'
  if (accretionRate.value > JET_THRESHOLD) return 'Jets fading: the rate is above the 2% threshold'
  return jetStrength.value < 0.95 ? 'Jets on, weak: slow spin' : 'Jets on'
})
const formatRate = (rate) => `${(rate * 100).toFixed(rate < 0.1 ? 2 : 1)}% of Eddington`
// the volume pass draws the gas, the jets, or both
const volumeNeeded = computed(() => volumetric.value || jetStrength.value > 0 || bodiesActive.value)
const thickness = ref(DEFAULTS.thickness)
const density = ref(DEFAULTS.density)
const quality = ref(DEFAULTS.quality)
const panelHidden = ref(true)
const infoOpen = ref(false)
// The info drawer: one accordion section per topic
const infoTopics = [
  {
    label: 'How this is made',
    icon: 'i-lucide-cpu',
    paragraphs: [
      `Nothing here is a video or a 3D model. Every pixel fires a light ray backwards from the camera and bends it through the curved space around a spinning (Kerr) black hole, following the method of James et al., "Gravitational lensing by spinning black holes in astrophysics, and in the movie Interstellar" (2015). A numerical solver (RK4) integrates the light-ray equations in a WebGL2 shader on your GPU. Spin 0 gives a Schwarzschild hole.`,
      `The rays are traced once and kept until the view changes. By default the disk is a thin sheet, and a ray picks up its colour and brightness where it crosses the disk plane, up to three times, which gives the glowing arc that appears over the top and under the hole (the far side of the disk, bent into view). With the volumetric gas or the jets switched on, a second pass follows each ray through that material instead, and runs every frame, because it moves. The trace also records where each ray ends up in the sky, for the starfield. A final bloom pass adds the glow.`,
    ],
  },
  {
    label: 'The accretion disk',
    icon: 'i-lucide-disc',
    paragraphs: [
      `The disk is a thin accretion disk that ends at the innermost stable orbit, which moves inward as the spin grows. Its brightness follows the Novikov-Thorne model: zero at the inner edge, peaking a little outside it, then fading with radius. The local temperature follows from that flux, and each pixel is coloured as a blackbody at the temperature seen after Doppler shift and gravitational redshift (computed for Kerr circular orbits). Procedural noise, sheared so the inside orbits faster than the outside, adds the clumpy structure.`,
      `Speed only changes how fast that noise turns on screen. The orbital motion that sets the colours and brightness is fixed by the radius and the spin, unless you change Orbit velocity.`,
    ],
  },
  {
    label: 'Volumetric gas and dust',
    icon: 'i-lucide-cloud',
    paragraphs: [
      `With Volumetric gas and dust switched on (it is off by default) the disk is a layer of gas and dust with real thickness, and not a flat sheet. The volume pass follows each light ray along its bent path and, at every step through the gas, adds the light the gas gives off and removes the light its dust absorbs. Dense lanes therefore darken what lies behind them, thin gas lets the far side show through, and the layer is thicker the further out it is (it flares). The gas thins out smoothly above and below the disk plane, in a Gaussian profile.`,
      `The gas keeps the thin disk's physics: the same Novikov-Thorne brightness profile, Doppler shift and gravitational redshift, evaluated at the distance from the spin axis. Its clumps come from a tiling 3D noise texture, looked up in a way that stretches them along the orbit; the differential rotation then shears and turns them, as for the thin disk. Thickness is the height of the gas as a fraction of the radius (3% by default), and Density sets how opaque it is. Changing the thickness does not change the total amount of gas, so a thicker disk is more diffuse. Volume quality is the resolution of the gas as a share of the picture; lower it if the frame rate drops, raise it for sharper detail.`,
      `This is a simple emission and absorption model, with the temperature taken from the disk's midplane profile. It is not a simulation of a real disk's vertical structure, and it has no scattering. Turn the option off to go back to the thin disk, which is much cheaper to draw. Detail and Contrast then change the gas live, and rebuild the thin disk's texture when released.`,
    ],
  },
  {
    label: 'The orbiting Sun',
    icon: 'i-lucide-sun',
    paragraphs: [
      `Orbiting Sun puts a body with the Sun's true radius just above the disk plane, on a circular orbit that turns with the disk at that radius. It is a sphere in the same volume pass as the gas, tested against each bent light ray, so it is lensed like everything else: its far side shows over and under the hole, and it hides the disk and stars behind it. Its light is shifted by the same factor g as the disk, so the side moving towards you is brighter and bluer, and it is darker towards the limb. It is drawn at 5,772 K.`,
      `The Sun's radius is fixed in kilometres, so in units of GM/c² it depends on the mass: about 0.1 for Sagittarius A*, but larger than the whole disk for a hole of a few solar masses, where it is not drawn. A real star is torn apart by tides inside r = R (M / m)^(1/3); the badge says whether the orbit is inside that radius. The body is only shown, not simulated: it does not open a gap in the gas or feel drag.`,
      `Orbiting Earth adds a body with the Earth's true radius beside the Sun, on the same orbit and 1 AU ahead of it (at most a quarter turn ahead on a small orbit). Next to the disk it gives no light, so it is a dark silhouette: lensed and hiding what is behind it, but not lit. It is about 1/109 of the Sun's width, so it is sub-pixel for a heavy hole and only shows for a light one, where the Sun itself is too large to draw. There are no shadows on the disk, because the disk glows by itself and has no single light source to cast one.`,
    ],
  },
  {
    label: 'Relativistic jets',
    icon: 'i-lucide-arrow-up-down',
    paragraphs: [
      `Some black holes launch jets of plasma from their poles at more than 90% of the speed of light. The material never crosses the horizon: it is flung out from the region just outside it. Spinning twists space around the hole (frame dragging) and with it the magnetic field of the hot plasma in the disk, which is wound tight along the spin axis; this stores energy that is released as the jet. The Blandford-Znajek mechanism describes how this takes energy from the hole's own rotation, so the jet's power grows with the square of the spin.`,
      `A jet needs three things: a fast spin, a disk to feed the hole, and a low accretion rate. Jets reliably switch on when the rate falls to about 2% of the Eddington rate, the rate at which the radiation pushed out by the infalling matter would balance gravity's pull. This is a share of an accretion rate that scales with the hole's mass, and not a mass of the disk. At lower rates the inner disk puffs up into a hot, thick flow that can carry the magnetic field; at higher rates the disk is thin and the jets are suppressed. After a star is torn apart the jet appears only once the rate has dropped, hundreds or thousands of days later.`,
      `Here the Accretion rate slider sets that share. The jets are fully on below 2% and fade out between 2% and 4%, and they also fade as the spin drops towards zero. They are drawn with the same bent light rays as the rest of the picture, so the jet pointing away from you is lensed over and around the hole, and they show with the thin disk as well as the gas. Show relativistic jets turns them off, which saves the cost of drawing them. Each is a narrow, nearly straight beam up and down the spin axis, with a bright core in a fainter sheath, that widens slowly and fades with height, with a faint ripple that drifts outward. The plasma moves at 0.92 of the speed of light, so its light is Doppler beamed: the jet pointing towards you is brighter and bluer, and the one pointing away is dimmer and redder. The effect is softened so that jets seen from the side stay visible, and seen from nearly along the axis the jet pointing at you is very bright. The shape, brightness and ripple are made up for the picture; the disk does not puff up as the rate falls, and the threshold and the dependence on spin are simple rules and not a simulation of the magnetic fields.`,
    ],
  },
  {
    label: 'The starfield',
    icon: 'i-lucide-sparkles',
    paragraphs: [
      `Each light ray is followed until it escapes, and the direction it ends up pointing in is the part of the sky that pixel sees. The stars are drawn at that direction, so the sky is lensed exactly as the light is: the stars near the hole are stretched into arcs, there is a ring of them around the shadow, and the shadow itself shows none, because that light fell into the hole. Gas in front of the stars hides them. Show starfield turns the stars on (they are off by default), Star amount thins them out and Star brightness sets how bright they are.`,
      `The stars are procedural and made up, not a real catalogue. The bending is real, but the field of view is a choice: because the camera is at infinity, all its rays are parallel, so each pixel's own viewing direction is added to the bent direction to spread the stars across the picture. The field is fixed in the hole's frame, so the stars move as you turn the view. It needs a GPU with five render targets, and is switched off without them.`,
    ],
  },
  {
    label: 'Redshift and blueshift',
    icon: 'i-lucide-rainbow',
    paragraphs: [
      `Light from the disk is shifted in frequency by two effects: the Doppler effect of the orbiting matter (a blueshift on the side moving towards you, a redshift on the side moving away) and the gravitational redshift from climbing out of the hole's gravity, which is strongest near the hole. One factor g covers both: g above 1 is a blueshift, below 1 a redshift.`,
      `The observed temperature scales with g and the observed brightness with g to the fourth power (relativistic beaming), so the approaching side looks hotter and much brighter, and the receding side cooler and dimmer. "Show redshift and blueshift" replaces the temperature colours with the shift itself: blue where g is above 1, red where it is below, white where it is 1.`,
      `Orbit velocity scales how fast the disk matter really orbits, as a multiple of the physical value. Above 1 is an exaggeration that strengthens the shifts and the beaming, capped so that no matter outruns light. At 0 only the gravitational redshift is left.`,
    ],
  },
  {
    label: 'Mass and size',
    icon: 'i-lucide-scale',
    paragraphs: [
      `The physics is scale-free, so the picture looks the same for any mass (1 to 66 billion solar masses, the estimated mass of TON 618). The Mass slider only sets the real size. One gravitational radius, GM/c², is 1.48 km per solar mass. The event horizon is two of those for a non-spinning hole and shrinks towards one at maximum spin. The black disc you see is the shadow, about 2.6 times the horizon for a non-spinning hole, because gravity bends light into the hole from beyond it.`,
    ],
  },
  {
    label: 'Spin and frame dragging',
    icon: 'i-lucide-rotate-cw',
    paragraphs: [
      `Spin a/M is the hole's angular momentum in units of GM²/c, not a speed. 0 is a non-rotating (Schwarzschild) hole. 1 is the extremal limit, where the horizon has shrunk to GM/c², half its size without spin. The slider stops at 0.998, the limit Thorne found in 1974 for a hole spun up by a thin disk: it swallows more of the disk's counter-rotating light than its co-rotating light, which stops the spin-up there.`,
      `A spinning hole drags space around with it (frame dragging). Its effects here: the disk's inner edge, the innermost stable orbit, moves in from 6 GM/c² at spin 0 to about 1.24 GM/c² at 0.998; the shadow is flattened and shifted to one side; and the side of the disk moving towards you gets brighter and bluer. Going above 1 is possible only as an experiment, described below.`,
    ],
  },
  {
    label: 'Scale rings and the photon sphere',
    icon: 'i-lucide-circle-dot',
    paragraphs: [
      `Scale rings are all drawn at the same scale as the hole: blue is the event horizon, violet the Earth (6,371 km radius), yellow the Sun (695,700 km) and green the orbit of Neptune (30 AU). Each is labelled and hidden when it is off-screen. The Earth and Sun are easiest to see for holes of a few hundred to a few hundred thousand solar masses, and the Neptune ring only fits for roughly a billion solar masses or more.`,
      `The photon sphere is where light can travel in a circle around the hole, unstably. It is at 3 GM/c² (1.5 times the horizon radius) without spin. A spinning hole has two equatorial orbits, a smaller one for light moving with the spin and a larger one against it, and both are shown. Like the horizon ring they are drawn at the true coordinate radius, inside the shadow. The thin bright ring around the shadow is light that has circled close to this region before escaping.`,
    ],
  },
  {
    label: 'Spacetime grid',
    icon: 'i-lucide-grid-3x3',
    paragraphs: [
      `The grid is a 3D lattice of lines in the hole's coordinate frame (z is the spin axis), traced through the same curved space as the light, so its lines bend, stretch and wrap around the hole exactly as light does. It shows how light is bent, not an intrinsic measure of curvature.`,
      `Grid size sets the side length of the cube and Grid lines how many cells it is divided into. The X, Y and Z planes each show one plane through the hole (x = 0, y = 0 and z = 0, which is the disk plane); Full 3D grid repeats them through space.`,
    ],
  },
  {
    label: 'Rubber sheet',
    icon: 'i-lucide-funnel',
    paragraphs: [
      `The classic picture of a bent sheet is an embedding diagram: the equatorial plane drawn as a surface whose own flat geometry matches the curved space there, so distances along the sheet are the real distances. For a non-spinning hole it is Flamm's paraboloid, z = 2 sqrt(2 (r - 2)); for a spinning hole it is an approximation.`,
      `It is a diagram drawn over the picture with the same camera, not something a camera would see, and it is not lensed.`,
    ],
  },
  {
    label: 'Spin above 1 (not physical)',
    icon: 'i-lucide-triangle-alert',
    paragraphs: [
      `A real black hole cannot spin faster than a/M = 1. Beyond that the horizon would disappear, leaving a naked singularity, which the cosmic censorship conjecture says does not occur. "Allow spin above 1" lets the slider go up to 1.5 as an experiment.`,
      `It is an approximation, not a physical result. The ray tracing still uses the full Kerr geometry, but without a horizon there is nothing to absorb the light, so it is discarded very close to the centre. The disk profile is held at that of the fastest physical spin, the sheet starts where its embedding stops being real, and there is no event horizon ring and no prograde photon orbit. The retrograde photon orbit continues smoothly.`,
    ],
  },
  {
    label: 'Controls',
    icon: 'i-lucide-sliders-horizontal',
    paragraphs: [
      `Drag to rotate the view and scroll to zoom. The controls drawer groups the settings into tabs: the black hole (mass, spin, the accretion rate that decides whether jets appear, the jets themselves, and the option to allow spin above 1), the view (zoom, pitch, yaw, roll), the accretion disk (speed, orbit velocity, temperature, brightness, inner and outer edge, texture detail and contrast, and the volumetric gas with its thickness, density and quality) and the display (bloom, the starfield with its amount and brightness, redshift colours, the scale rings and photon sphere, the rubber sheet and the spacetime grid). Hover over any control for an explanation, and Reset eases everything back to the defaults. The counter in the top right shows rendered frames per second.`,
    ],
  },
  {
    label: 'Sources',
    icon: 'i-lucide-book-open',
    paragraphs: [
      `Ray tracing: James et al. (2015), as above. Disk model: Novikov and Thorne (1973), in the closed form of Page and Thorne (1974); the thin-disk theory is reviewed in Abramowicz and Fragile, "Foundations of Black Hole Accretion Disk Theory" (Living Reviews in Relativity, 2013). Thicker disk models are not included. Innermost stable and photon orbits: Bardeen, Press and Teukolsky (1972).`,
    ],
  },
]
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
let volumeProgram
let volumeTarget
let noiseTexture
let profileTexture
let profileKey = ''
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
let sheetProgram
let sheetVao
let sheetBuffer
let sheetCount = 0
let sheetKey = ''

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

watch([bloom, speed, temperature, brightness, showHorizon, showSun, showEarth, showSolarSystem, showPhoton, massLog], () => {
  dirty = true
})

// The render is scale-free (G = c = M = 1), so mass does not change the picture;
// it only sets the physical size. The horizon is at r+ = M (1 + sqrt(1 - a^2)).
// A hole with spin above 1 has no horizon, so its radius is 0 (nothing to draw)
const isNaked = computed(() => spin.value > 1)
const spinMax = computed(() => (allowNaked.value ? NAKED_MAX_SPIN : MAX_SPIN))
watch(allowNaked, (allowed) => {
  if (!allowed && spin.value > MAX_SPIN) spin.value = MAX_SPIN
})
const horizonRadius = computed(() => (isNaked.value ? 0 : 1 + Math.sqrt(1 - spin.value * spin.value)))
// The Sun's radius in units of M, so it shares the render's scale
const sunRadius = computed(() => SOLAR_RADIUS_KM / (KM_PER_SOLAR_MASS * solarMass.value))
const earthRadius = computed(() => EARTH_RADIUS_KM / (KM_PER_SOLAR_MASS * solarMass.value))
const solarSystemRadius = computed(() => NEPTUNE_ORBIT_KM / (KM_PER_SOLAR_MASS * solarMass.value))
// Circular equatorial photon orbits of a Kerr hole (Bardeen, Press & Teukolsky 1972):
// r = 2 M (1 + cos(2/3 arccos(-+ a))), prograde first. Both are 3 M without spin.
// Above a = 1 there is no prograde orbit, and the retrograde one continues with cosh and arcosh.
const photonRadius = (a) => {
  if (a > 1) return 2 * (1 + Math.cosh(2 / 3 * Math.acosh(a)))
  if (a < -1) return 0
  return 2 * (1 + Math.cos(2 / 3 * Math.acos(a)))
}
const photonPrograde =computed(() => photonRadius(-spin.value))
const photonRetrograde = computed(() => photonRadius(spin.value))
const photonLabel = (kind, radiusM) => `Photon ${kind}, ${radiusM.toFixed(2)} GM/c² (${formatLength(radiusM * KM_PER_SOLAR_MASS * solarMass.value)})`
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
    [showHorizon.value && horizonRadius.value > 0, 'horizon', `Event horizon, ${formatLength(horizonKm.value)} radius`, horizonRadius.value, '#73d9ff'],
    [showPhoton.value && spin.value <= 0.01, 'photon', photonLabel('sphere', photonPrograde.value), photonPrograde.value, '#ff7359'],
    [showPhoton.value && spin.value > 0.01 && photonPrograde.value > 0, 'photon', photonLabel('orbit, prograde', photonPrograde.value), photonPrograde.value, '#ff7359'],
    [showPhoton.value && spin.value > 0.01, 'photon-retro', photonLabel('orbit, retrograde', photonRetrograde.value), photonRetrograde.value, '#ff7359'],
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
// The disk model (inner edge, flux profile) only exists for a < 1, so above that it holds the largest physical spin
const diskSpin = computed(() => Math.min(spin.value, MAX_SPIN))
const innerRadius = computed(() => Math.max(rIn.value, iscoRadius(diskSpin.value)))

// The orbiting Sun stays in the disk, between its inner and outer edge. Its radius is fixed in km,
// so in GM/c^2 it is large around a light hole; it is only drawn when it fits well inside its orbit.
const orbiterRadius = computed(() => Math.min(Math.max(orbiterOrbit.value, innerRadius.value), rOut.value))
const orbiterFits = computed(() => sunRadius.value < 0.5 * orbiterRadius.value)
const orbiterActive = computed(() => showOrbiter.value && orbiterFits.value)
// The Earth rides beside the Sun at the same orbit radius, ahead of it by their true distance of
// 1 AU along the orbit (at most a quarter turn, so it stays beside the Sun on a small orbit).
// It is drawn on its own, so it still shows when the Sun is too large for this mass.
const earthFits = computed(() => earthRadius.value < 0.5 * orbiterRadius.value)
const earthActive = computed(() => showOrbiterEarth.value && earthFits.value)
const earthAhead = computed(() => Math.min(KM_PER_AU / (KM_PER_SOLAR_MASS * solarMass.value) / orbiterRadius.value, Math.PI / 2))
const bodiesActive = computed(() => orbiterActive.value || earthActive.value)
const earthStatus = computed(() => {
  if (!earthFits.value) return 'The Earth is too large for this orbit at this mass: raise the mass or the orbit radius'
  return `The Earth is ${earthRadius.value.toPrecision(2)} GM/c² across at this mass. It is a dark silhouette, and it is only visible once it spans a pixel or two: lower the mass to enlarge it`
})
// Inside this radius the tides of the hole pull a Sun-like star apart: R (M / m)^(1/3), in GM/c^2
const tidalRadius = computed(() => SOLAR_RADIUS_KM * solarMass.value ** (1 / 3) / (KM_PER_SOLAR_MASS * solarMass.value))
const orbiterStatus = computed(() => {
  if (!orbiterFits.value) return 'The Sun is too large for this orbit at this mass: raise the mass or the orbit radius'
  if (orbiterRadius.value < tidalRadius.value) return `Inside the tidal radius (${tidalRadius.value.toFixed(1)} GM/c²): a real Sun would be torn apart here`
  return `Outside the tidal radius (${tidalRadius.value.toFixed(1)} GM/c²): the Sun would survive here`
})

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

// the rubber sheet is a line overlay drawn after the shading, so it needs no new trace
watch([showSheet, sheetSize, showShift], () => {
  dirty = true
})

// The volume pass runs every frame, so these only need a redraw. Turning the volume on or off
// changes what the trace records (the thin disk's crossings), and the thin disk's texture is
// only rebuilt while it is not in use, so it is brought up to date when it comes back.
watch([thickness, density, detail, contrast, showStars, starBrightness, starAmount, showJets, accretionLog, showOrbiter, showOrbiterEarth, orbiterOrbit, massLog], () => {
  dirty = true
})
watch(volumetric, (on) => {
  needsTrace = true
  dirty = true
  if (!on) rebuildDiskTexture()
})

watch([rIn, rOut, roll, pitch, yaw, spin, orbit, showGrid, gridSize, gridLines, showGridX, showGridY, showGridZ, showGridStack], () => {
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
// Spin used for the disk's flux profile: uSpin, held to the physical range
uniform float uFluxSpin;
uniform float uCapture;
// Spacetime grid: lattice spacing in GM/c^2 (0 = off), half the cube's size and line width in the same units
uniform float uGridSpacing;
uniform float uGridExtent;
// Which axes (x, y, z) have grid planes, 1 or 0, and whether the whole stack of planes
// is drawn (1) or only the one through the hole, at 0 (0)
uniform vec3 uGridAxes;
uniform float uGridStack;
uniform float uGridWidth;
// Page & Thorne roots (sqrt(r_isco), x1, x2, x3) and 1 / peak flux, see novikovThorneFlux
uniform vec4 uRoots;
uniform float uFluxNorm;
// Orbital velocity as a multiple of the Keplerian one
uniform float uOrbit;
// 1 draws the thin disk (crossings of the equatorial plane), 0 leaves it to the volume pass
uniform float uThin;
#ifdef VOLUME
layout(location = 0) out vec4 o0;
#else
layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;
layout(location = 2) out vec4 o2;
layout(location = 3) out vec4 o3;
#ifdef STARS
// Where in the sky the ray ends up (direction xyz, 1 if it escaped)
layout(location = 4) out vec4 o4;
#endif
#endif
// Radians of sky per unit of screen coordinate, see skyDirection
uniform float uStarFov;
vec4 gSky = vec4(0.0);

float gData[16];
int gCount = 0;
// Kerr photon constants for the current ray (E = 1): azimuthal momentum L,
// Carter constant Q, and the combinations used by the radial potential.
float gL = 0.0;
float gC = 0.0;
float gK = 0.0;
// Strongest grid line seen along the current ray, 0 to 1
float gGrid = 0.0;

float gridCoverage(float distance) {
  return 1.0 - smoothstep(0.5 * uGridWidth, 1.5 * uGridWidth, distance);
}

float latticeDistance(float x) {
  return abs(x - uGridSpacing * floor(x / uGridSpacing + 0.5));
}

// A 3D lattice in the hole's Boyer-Lindquist Cartesian frame (z is the spin axis).
// A ray is almost never exactly on a line, so lines are drawn where it crosses a
// lattice plane close to one of that plane's lines. The three plane families
// together give every line of the lattice.
void gridSegment(vec3 from, vec3 to, float extent) {
  vec3 cellFrom = floor(from / uGridSpacing);
  vec3 cellTo = floor(to / uGridSpacing);
  for (int k = 0; k < 3; k += 1) {
    if (uGridAxes[k] < 0.5 || cellFrom[k] == cellTo[k]) continue;
    float planeIndex = max(cellFrom[k], cellTo[k]);
    if (uGridStack < 0.5 && planeIndex != 0.0) continue;
    float plane = planeIndex * uGridSpacing;
    vec3 q = mix(from, to, (plane - from[k]) / (to[k] - from[k]));
    if (any(greaterThan(abs(q), vec3(extent)))) continue;
    float lineA = gridCoverage(latticeDistance(q[(k + 1) % 3]));
    float lineB = gridCoverage(latticeDistance(q[(k + 2) % 3]));
    gGrid = max(gGrid, max(lineA, lineB));
  }
}

float rootTerm(float xi, float xj, float xk, float x, float a) {
  return 3.0 * (xi - a) * (xi - a) / (xi * (xi - xj) * (xi - xk))
    * log((x - xi) / (uRoots.x - xi));
}

// Flux radiated by a thin disk around a Kerr hole (Novikov & Thorne 1973, in the
// closed form of Page & Thorne 1974, x = sqrt(r)). It vanishes at the innermost
// stable orbit and falls as r^-3 far out; uFluxNorm scales the peak to 1.
float novikovThorneFlux(float radius) {
  float a = max(uFluxSpin, 0.001);
  float x0 = uRoots.x;
  float x = max(sqrt(radius), x0 * 1.0001);
  float bracket = x - x0 - 1.5 * a * log(x / x0)
    - rootTerm(uRoots.y, uRoots.z, uRoots.w, x, a)
    - rootTerm(uRoots.z, uRoots.y, uRoots.w, x, a)
    - rootTerm(uRoots.w, uRoots.y, uRoots.z, x, a);
  return max(bracket, 0.0) / (x * x * x * x * (x * x * x - 3.0 * x + 2.0 * a));
}

// Angular velocity and time dilation of matter orbiting in the equatorial plane at a radius.
vec2 orbitMotion(float radius) {
  float r15 = radius * sqrt(radius);
  // uOrbit scales the orbital angular velocity (1 is the Keplerian value). The time
  // dilation u^t = 1 / sqrt(-g_tt - 2 g_tphi W - g_phiphi W^2) of the equatorial Kerr metric
  // equals the closed form for circular orbits at 1, and stays valid for other speeds.
  float omegaKepler = 1.0 / (r15 + uSpin);
  float omega = uOrbit * omegaKepler;
  float gPhiPhi = radius * radius + uSpin * uSpin + 2.0 * uSpin * uSpin / radius;
  if (uOrbit > 1.0) {
    // matter cannot go faster than light: stop just short of u^t^-2 = 0.02, never below Keplerian
    float limit = (4.0 * uSpin / radius
      + sqrt(max(16.0 * uSpin * uSpin / (radius * radius) + 4.0 * gPhiPhi * (1.0 - 2.0 / radius - 0.02), 0.0)))
      / (2.0 * gPhiPhi);
    omega = min(omega, max(omegaKepler, limit));
  }
  float radicand = 1.0 - 2.0 / radius + 4.0 * uSpin * omega / radius - gPhiPhi * omega * omega;
  return vec2(omega, inversesqrt(max(radicand, 0.02)));
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
  vec2 motion = orbitMotion(radius);
  float redshift = clamp(1.0 / (motion.y * (1.0 - motion.x * gL)), 0.05, 2.0);
  float textureAngle = angle;
  textureAngle -= TAU * floor((textureAngle + PI) / TAU);
  int base = gCount * 5;

  gData[base] = clamp((radius - TEX_MIN) / TEX_STEP, 0.0, TEXTURE_RADII - 1.001);
  gData[base + 1] = textureAngle;
  gData[base + 2] = pow(uRIn / radius, SHEAR);
  gData[base + 3] = flux * pow(redshift, 4.0) * edge;
  // the edge weight (0 to 1) rides in the fraction and the shift factor g, in thousandths, in the integer part
  gData[base + 4] = floor(redshift * 1000.0 + 0.5) + edge * 0.99;
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

#ifdef VOLUME
precision highp sampler3D;
// Tileable 3D noise (one tile is NOISE_PERIOD wide) and the disk profile per radius:
// x flux (peak 1), y orbital angular velocity, z time dilation
uniform sampler3D uNoise;
uniform sampler2D uProfile;
// uOutInv: 1 over the radius out to which anything is drawn (the gas, or the jets if they reach further)
uniform float uOutInv;
uniform float uGasOutInv;
uniform float uInInv;
uniform float uZCut;
// 1 if the gas is drawn, and the jets' strength (0 for none) and the phase of their knots in M
uniform float uGas;
uniform float uJet;
uniform float uJetPhase;
uniform float uThick;
uniform float uDensity;
uniform float uContrast;
uniform float uNoiseScale;
uniform float uAzimuthCycles;
uniform float uPhaseA;
uniform float uPhaseB;
uniform float uMixA;
uniform float uPeakTemp;
uniform float uVolScale;
// The orbiting body: 1 if it is drawn; the radius of its orbit, its own radius and its azimuth (the
// first two in GM/c^2); and the range of u = 1/r in which a step of a ray can touch it
uniform float uBodyOn;
uniform vec3 uBody;
uniform vec2 uBodyBand;
uniform vec2 uEarth;

// Light, light-weighted temperature (K) and shift, and what is left of the ray after the gas
float gVolLight = 0.0;
float gVolTemp = 0.0;
float gVolShift = 0.0;
float gVolT = 1.0;
// How much of the ray the body has covered so far, 0 to 1
float gBodyCover = 0.0;
float gEarthCover = 0.0;

vec3 volumePoint(float u, vec3 n, float extra) {
  float cs = cos(extra);
  float sn = sin(extra);
  return vec3(n.x * cs - n.y * sn, n.x * sn + n.y * cs, n.z) / max(u, 1e-4);
}

// Gas density falls off as a Gaussian above the plane, with a scale height of uThick times the
// radius (a flared disk) and clumps from the noise, which the disk's differential rotation shears
// like the thin disk's texture. Each sample both emits (the disk's flux, Doppler and redshift
// as before) and absorbs, so dense lanes dim what lies behind them.
void volumeGas(vec3 pos, float dl) {
  float radius = length(pos.xy);
  float edge = smoothstep(uRIn, uRIn + 0.7, radius)
    * (1.0 - smoothstep(uROut * 0.35, uROut, radius));
  float scaleHeight = uThick * radius;
  float vertical = exp(-0.5 * pos.z * pos.z / (scaleHeight * scaleHeight));
  if (edge * vertical < 0.003) return;

  // The noise is looked up in cylindrical coordinates (radius, azimuth, height), with a whole
  // number of tiles around, so the clumps are stretched along the orbit; the skew in azimuth keeps
  // the tiles that repeat along the radius from lining up.
  float gas = 0.0;
  float shear = pow(uRIn / radius, SHEAR);
  float azimuth = atan(pos.y, pos.x);
  for (int layer = 0; layer < 2; layer += 1) {
    float weight = layer == 0 ? uMixA : 1.0 - uMixA;
    if (weight < 0.003) continue;
    float angle = azimuth - shear * (layer == 0 ? uPhaseA : uPhaseB);
    vec3 q = vec3(radius * uNoiseScale, angle * uAzimuthCycles / TAU + 0.618 * radius * uNoiseScale, pos.z * uNoiseScale);
    // a finer copy (a whole number of times as dense, so it still tiles) adds the small strands
    float coarse = textureLod(uNoise, q, 0.0).r;
    float fine = textureLod(uNoise, q * 3.0 + vec3(0.37, 0.11, 0.53), 0.0).r;
    gas += weight * (0.65 * coarse + 0.35 * fine);
  }
  float clumps = clamp(gas * 1.8, 0.0, 1.4);

  float at = clamp((radius - TEX_MIN) / TEX_STEP, 0.0, TEXTURE_RADII - 1.001);
  int i0 = int(at);
  vec4 profile = mix(texelFetch(uProfile, ivec2(i0, 0), 0), texelFetch(uProfile, ivec2(i0 + 1, 0), 0), fract(at));
  float shift = clamp(1.0 / (profile.z * (1.0 - profile.y * gL)), 0.05, 2.0);

  // the factor 0.3 sets a vertical optical depth of about 1 at the default density, whatever the thickness
  float tau = 0.3 * uDensity * edge * vertical * (0.2 + 1.6 * min(clumps, 1.0)) / scaleHeight * dl;
  float absorbed = 1.0 - exp(-tau);
  float shift2 = shift * shift;
  float light = gVolT * absorbed * profile.x * shift2 * shift2 * (0.12 + 1.5 * pow(clumps, uContrast));
  gVolLight += light;
  gVolTemp += light * uPeakTemp * shift * sqrt(sqrt(profile.x));
  gVolShift += light * clamp(log2(shift), -1.0, 1.0);
  gVolT *= 1.0 - absorbed;
}

// A relativistic jet along the spin axis, up and down: a narrow beam of plasma that widens slowly
// with height, a bright core in a fainter sheath, fading in above the hole and out at its end, and
// a faint ripple in its brightness that drifts outward. The plasma moves away from the hole at JET_BETA of the speed of light, so its
// light is Doppler beamed: with delta = 1 / (gamma (1 - beta cos)), where cos is the angle between the
// jet's velocity and the direction the light travels to the observer, the part pointing at the
// observer is much brighter and bluer and the part pointing away much dimmer, as seen in real jets.
// The plasma is thin, so it adds light but does not absorb.
const float JET_LENGTH = ${f(JET_LENGTH)};
const float JET_BETA = ${f(JET_BETA)};
const float JET_BASE = ${f(JET_BASE)};
// Radius of the beam at a height above the hole: a narrow, nearly straight cone (about 1.3 degrees)
float jetWidth(float height) {
  return 0.25 + 0.022 * height;
}

void volumeJet(vec3 pos, float dl, vec3 toward) {
  float height = abs(pos.z);
  float width = jetWidth(height);
  float x = length(pos.xy) / width;
  // a bright, narrow core inside a fainter sheath, fading in above the hole and out at the end
  float beam = (exp(-4.0 * x * x) + 0.2 * exp(-0.8 * x * x))
    * smoothstep(JET_BASE, JET_BASE + 1.5, height)
    * (1.0 - smoothstep(0.6 * JET_LENGTH, JET_LENGTH, height));
  // the same power through a wider beam is spread thinner
  float thin = 0.25 / width;
  float amount = beam * pow(thin, 1.5);
  if (amount < 0.002) return;

  // a faint, long ripple in the brightness along the beam, drifting outward, so that the stream
  // looks alive but steady
  vec3 q = vec3(pos.xy * 0.15, (height - uJetPhase) / 20.0);
  float ripple = clamp((textureLod(uNoise, q, 0.0).r - 0.3) / 0.45, 0.0, 1.0);
  float knots = 0.85 + 0.3 * ripple;

  float cosine = toward.z * sign(pos.z);
  float gamma = 1.0 / sqrt(1.0 - JET_BETA * JET_BETA);
  float doppler = 1.0 / (gamma * (1.0 - JET_BETA * cosine));
  float well = sqrt(max(1.0 - 2.0 / length(pos), 0.05));
  float shift = doppler * well;
  float light = gVolT * uJet * ${f(JET_BRIGHTNESS)} * amount * knots
    * (0.6 + 0.4 * min(shift * shift, 6.0)) * dl;
  gVolLight += light;
  gVolTemp += light * clamp(${f(JET_TEMPERATURE)} * shift, 3000.0, 40000.0);
  gVolShift += light * clamp(log2(shift), -1.0, 1.0);
}

// A step of the ray against the body, a Sun-sized sphere on a circular orbit in the disk plane. It
// is covered where the step passes within its radius of its centre, with the edge softened over
// half a pixel of this target so that it does not alias. The light of the newly covered part is added,
// darker towards the limb, and what lies behind it is hidden. The light is shifted like the disk's,
// by g = 1 / (u^t (1 - W L)) at its orbit, so the side moving towards you is brighter and bluer.
// The covered part is tracked per body in "covered". A body that gives no light (the Earth, which is
// dark next to the disk) only hides what is behind it, as a silhouette.
void volumeSphere(vec3 from, vec3 to, vec3 centre, float radius, float emits, inout float covered) {
  if (radius <= 0.0) return;
  vec3 along = to - from;
  float t = clamp(dot(centre - from, along) / max(dot(along, along), 1e-8), 0.0, 1.0);
  float distanceToCentre = distance(centre, from + t * along);
  float soft = 0.5 / (uUnit * uVolScale);
  float cover = 1.0 - smoothstep(radius - soft, radius + soft, distanceToCentre);
  float fresh = cover - covered;
  if (fresh <= 0.0) return;

  if (emits > 0.0) {
    vec2 motion = orbitMotion(uBody.x);
    float shift = clamp(1.0 / (motion.y * (1.0 - motion.x * gL)), 0.05, 2.0);
    float ratio = distanceToCentre / radius;
    float limb = 1.0 - 0.6 * (1.0 - sqrt(max(1.0 - ratio * ratio, 0.0)));
    float light = gVolT * fresh * ${f(ORBITER_LIGHT)} * limb * min(pow(shift, 4.0), 6.0);
    gVolLight += light;
    gVolTemp += light * ${f(ORBITER_TEMPERATURE)} * shift;
    gVolShift += light * clamp(log2(shift), -1.0, 1.0);
  }
  // what is left is the part of the ray the body does not cover
  gVolT *= (1.0 - cover) / max(1.0 - covered, 1e-4);
  covered = cover;
}

// The Sun and the Earth beside it, both just above the disk plane at the same orbit radius. uBody
// holds the orbit radius, the Sun's radius (0 if it is not drawn) and the Sun's azimuth; uEarth
// holds the Earth's radius (0 if it is not drawn) and how far ahead of the Sun it is.
void volumeBody(vec3 from, vec3 to) {
  vec3 sun = vec3(cos(uBody.z) * uBody.x, sin(uBody.z) * uBody.x, uBody.y * ${f(ORBITER_CLEARANCE)});
  volumeSphere(from, to, sun, uBody.y, 1.0, gBodyCover);
  float earthAzimuth = uBody.z + uEarth.y;
  vec3 earth = vec3(cos(earthAzimuth) * uBody.x, sin(earthAzimuth) * uBody.x, uEarth.x * ${f(ORBITER_CLEARANCE)});
  volumeSphere(from, to, earth, uEarth.x, 0.0, gEarthCover);
}

// One integration step of the ray, from (u, n, extra) to the next state, in the hole's frame
void volumeStep(float u, vec3 n, float extra, float nextU, vec3 nextN, float nextExtra) {
  vec3 from = volumePoint(u, n, extra);
  vec3 to = volumePoint(nextU, nextN, nextExtra);
  if (uBodyOn > 0.5) volumeBody(from, to);
  float span = distance(from, to);
  // the light travels towards the observer, against the direction the ray is followed in
  vec3 toward = (from - to) / max(span, 1e-5);
  // the steps far out are long, so they are cut into pieces
  int count = int(clamp(ceil(span / 0.4), 1.0, 8.0));
  float piece = span / float(count);
  for (int j = 0; j < 8; j += 1) {
    if (j >= count) break;
    vec3 at = mix(from, to, (float(j) + 0.5) / float(count));
    if (uGas > 0.5) volumeGas(at, piece);
    if (uJet > 0.0) volumeJet(at, piece, toward);
  }
}
#endif

#ifdef STARS
// The observer is at infinity, so all rays are parallel and, without the hole, would end in one
// and the same direction. To give the picture a field of view, the direction each pixel looks in
// is added to the direction the (bent) ray ends in. The deflection is the real one; the field
// of view is a choice. Screen right is the y axis and up is (-cos, 0, sin) of the inclination.
vec4 skyDirection(vec3 n, float extra, vec2 screen, float cosObs, float sinObs) {
  float cs = cos(extra);
  float sn = sin(extra);
  vec3 ended = vec3(n.x * cs - n.y * sn, n.x * sn + n.y * cs, n.z);
  vec3 right = vec3(0.0, 1.0, 0.0);
  vec3 up = vec3(-cosObs, 0.0, sinObs);
  return vec4(normalize(ended + (screen.x * right + screen.y * up) * uStarFov), 1.0);
}
#endif

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
  float gridExtent = uGridExtent;
  // the lattice cube fits inside a sphere of 1.74 times its half-size
  float gridMinU = 1.0 / (1.74 * gridExtent);
  vec3 gridPrev = vec3(0.0);
  bool hasGridPrev = false;

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

#ifndef VOLUME
    if (uThin > 0.5 && n.z * nextN.z < 0.0) {
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
#endif

    if (uGridSpacing > 0.0) {
      if (nextU > gridMinU) {
        float cs = cos(nextExtra);
        float sn = sin(nextExtra);
        vec3 gridPoint = vec3(nextN.x * cs - nextN.y * sn, nextN.x * sn + nextN.y * cs, nextN.z) / nextU;
        if (hasGridPrev) gridSegment(gridPrev, gridPoint, gridExtent);
        gridPrev = gridPoint;
        hasGridPrev = true;
      } else {
        hasGridPrev = false;
      }
    }

#ifdef VOLUME
    // only the wedge around the disk plane, between the inner and outer edge, holds gas, and the
    // jets are in a narrow cone round the spin axis
    bool inGas = uGas > 0.5 && nextU > uGasOutInv && nextU < uInInv && abs(nextN.z) < uZCut;
    bool inJet = false;
    if (uJet > 0.0 && nextU > uOutInv) {
      float r = 1.0 / nextU;
      float h = r * abs(nextN.z);
      inJet = h > JET_BASE && r * sqrt(max(1.0 - nextN.z * nextN.z, 0.0)) < 3.5 * jetWidth(h);
    }
    bool inBody = uBodyOn > 0.5 && max(u, nextU) >= uBodyBand.x && min(u, nextU) <= uBodyBand.y;
    if (inGas || inJet || inBody) {
      volumeStep(u, n, extra, nextU, nextN, nextExtra);
      if (gVolT < 0.01) return;
    }
    // a ray that is past the outer edge and moving away does not come back
    if (nextU < uOutInv && nextU < u) return;
#endif

    if (nextU >= uCapture) return;
    if (nextU <= 0.0) {
      gData[15] = nearCount;
#ifdef STARS
      gSky = skyDirection(nextN, nextExtra, screen, cosObs, sinObs);
#endif
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


#ifdef VOLUME
// The target is smaller than the picture by uVolScale, so a pixel here stands for a block of picture pixels.
// The temperature and shift are stored multiplied by the light, so that filtering between pixels stays correct.
void main() {
  vec2 pix = vec2(gl_FragCoord.x / uVolScale - 0.5, H - 0.5 - gl_FragCoord.y / uVolScale);
  traceRay(rayCoord(pix, uUnit), cos(uIncl), sin(uIncl));
  o0 = vec4(gVolLight, gVolTemp * 0.001, gVolShift, 1.0 - gVolT);
}
#else
void main() {
  for (int i = 0; i < 16; i += 1) gData[i] = 0.0;
  traceRay(rayCoord(pixelCoord(), uUnit), cos(uIncl), sin(uIncl));
  // gData[15] is the photon-ring step count (an integer); the grid coverage rides in its fraction
  gData[15] += min(gGrid, 1.0) * 0.99;
  o0 = vec4(gData[0], gData[1], gData[2], gData[3]);
  o1 = vec4(gData[4], gData[5], gData[6], gData[7]);
  o2 = vec4(gData[8], gData[9], gData[10], gData[11]);
  o3 = vec4(gData[12], gData[13], gData[14], gData[15]);
#ifdef STARS
  o4 = gSky;
#endif
}
#endif
`

const withDefine = (source, name) => source.replace('#version 300 es\n', `#version 300 es\n#define ${name}\n`)
// The same ray integrator, but it marches through a volume of gas around the disk plane
// instead of recording crossings of the plane
const VOLUME_SOURCE = withDefine(TRACE_SOURCE, 'VOLUME')
// The trace that also records where each ray ends up in the sky, for the starfield. It needs a
// fifth render target, which not every GPU has.
const TRACE_STARS_SOURCE = withDefine(TRACE_SOURCE, 'STARS')

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
uniform float uShift;
// The volume pass result: light, temperature and shift (both times the light), and opacity
uniform sampler2D uVolume;
uniform float uVolumetric;
// 1 if the volume pass was drawn (the gas is on, or the jets are); uVolumetric is the gas alone
uniform float uVolumeOn;
// 1 if the volume pass also holds something solid (the orbiting body) that hides what is behind it
uniform float uBodyOn;
// Where each ray ends in the sky (see the trace shader) and the star brightness, 0 for no stars
uniform sampler2D uTrace4;
uniform float uStars;
// Share of the star cells that hold a star, 0 to 1
uniform float uStarAmount;
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

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

// One layer of stars on the sky: the direction is projected onto a cube face and the face is cut
// into square cells, each with at most one star, kept away from the cell's edge so that only
// the pixel's own cell needs looking at. A star is a small Gaussian. Lensing keeps surface
// brightness, so a star stretched into an arc stays as bright; where the pixel covers more sky
// than the star (footprint) the star is spread out and fainter instead of aliasing.
vec3 starLayer(vec3 d, float cells, float density, float footprint, float seed) {
  vec3 a = abs(d);
  vec2 uv;
  float face;
  if (a.x >= a.y && a.x >= a.z) {
    uv = d.yz / a.x;
    face = d.x > 0.0 ? 0.0 : 1.0;
  } else if (a.y >= a.z) {
    uv = d.zx / a.y;
    face = d.y > 0.0 ? 2.0 : 3.0;
  } else {
    uv = d.xy / a.z;
    face = d.z > 0.0 ? 4.0 : 5.0;
  }
  vec2 p = uv * cells;
  vec2 id = floor(p);
  vec3 h = hash33(vec3(id, face + seed));
  if (h.x > density) return vec3(0.0);
  vec2 center = id + 0.2 + 0.6 * h.yz;
  // roughly the angle on the sky per unit of the (gnomonic) face coordinates
  float skew = pow(1.0 + dot(uv, uv), 0.75);
  float angle = length(p - center) / (cells * skew);
  float sigma = clamp(max(footprint, ${f(STAR_SIGMA)}), ${f(STAR_SIGMA)}, 0.2 / (cells * skew));
  float spread = ${f(STAR_SIGMA)} / sigma;
  float magnitude = hash13(vec3(id, face + seed + 3.7));
  vec3 tint = mix(vec3(0.65, 0.78, 1.0), vec3(1.0, 0.82, 0.62), hash13(vec3(id, face + seed + 7.1)));
  return tint * (0.15 + 2.0 * magnitude * magnitude * magnitude) * spread * spread * exp(-0.5 * angle * angle / (sigma * sigma));
}

vec3 starField(vec3 d, float footprint) {
  return starLayer(d, 22.0, 0.5 * uStarAmount, footprint, 0.0)
    + starLayer(d, 55.0, 0.4 * uStarAmount, footprint, 11.0)
    + starLayer(d, 140.0, 0.3 * uStarAmount, footprint, 23.0);
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
  // the volume pass holds the gas, the jets or both; the thin disk's crossings are added below
  if (uVolumeOn > 0.5) {
    vec4 volume = texture(uVolume, gl_FragCoord.xy / vec2(W, H));
    if (uVolumetric > 0.5 || uBodyOn > 0.5) transmittance = 1.0 - volume.a;
    float lit = max(volume.r, 1e-6);
    float shiftLog = volume.b / lit;
    vec3 shiftColor = mix(vec3(1.0), shiftLog > 0.0 ? vec3(0.25, 0.55, 1.0) : vec3(1.0, 0.2, 0.1), abs(shiftLog));
    diskLight = volume.r * mix(blackbody(volume.g / lit * 1000.0), shiftColor, uShift);
  }
  for (int i = 0; i < ${MAX_CROSSINGS}; i += 1) {
    if (uVolumetric > 0.5) break;
    int k = i * 5;
    float packed = g[k + 4];
    if (packed <= 0.0) continue;
    float edge = fract(packed) / 0.99;
    float shift = floor(packed) / 1000.0;
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
    // Optionally colour by the shift itself: red where light is redshifted (g < 1, receding
    // or deep in the well), blue where it is blueshifted (g > 1), white where unchanged.
    float shiftLog = clamp(log2(shift), -1.0, 1.0);
    vec3 shiftColor = mix(vec3(1.0), shiftLog > 0.0 ? vec3(0.25, 0.55, 1.0) : vec3(1.0, 0.2, 0.1), abs(shiftLog));
    diskLight += transmittance * opacity * g[k + 3] * disk.r * mix(blackbody(temperature), shiftColor, uShift);
    transmittance *= 1.0 - opacity;
    if (transmittance < 0.02) break;
  }

  vec2 pix = pixelCoord();
  // Photon ring: rays that escape after winding around the hole near the photon
  // orbit, measured by how many steps they spent close in (g[15]). Their shape
  // follows the Kerr shadow rather than a fixed circle.
  float grid = fract(g[15]) / 0.99;
  float added = 0.8 * smoothstep(60.0, 220.0, floor(g[15]));
  float shadowDistance = length(pix - vec2(CX, CY));
  added += 0.012 + 0.05 * exp(-shadowDistance / (uShadowPx * 2.0))
    * (shadowDistance > uShadowPx ? 1.0 : 0.1);
  float vignetteX = max(0.0, (W * 0.4 - pix.x) / (W * 0.4));
  float vignetteY = max(0.0, (pix.y - H * 0.8) / (H * 0.4));
  float vignette = 1.0 - 0.5 * clamp(vignetteX * 0.8 + vignetteY, 0.0, 1.0);

  vec3 disk = 1.0 - exp(-diskLight * uBrightness * vignette * mix(1.0, 0.4, uShift) * ${f(DISK_EXPOSURE)});
  vec3 gridLight = vec3(0.3, 0.62, 1.0) * grid * 0.55;
  // the stars behind the hole, seen through whatever gas is in front of them
  vec3 stars = vec3(0.0);
  if (uStars > 0.0) {
    vec4 sky = texelFetch(uTrace4, ip, 0);
    if (sky.w > 0.5) {
      vec4 skyX = texelFetch(uTrace4, min(ip + ivec2(1, 0), maxP), 0);
      vec4 skyY = texelFetch(uTrace4, min(ip + ivec2(0, 1), maxP), 0);
      float footprint = 0.0;
      if (skyX.w > 0.5) footprint = max(footprint, distance(skyX.xyz, sky.xyz));
      if (skyY.w > 0.5) footprint = max(footprint, distance(skyY.xyz, sky.xyz));
      // squared, so that the disk hides the stars behind it more than its opacity alone would
      stars = uStars * transmittance * transmittance * starField(sky.xyz, footprint);
    }
  }
  outColor = vec4(min(palette(added * vignette) + disk + gridLight + stars, vec3(1.0)), 1.0);
}
`

// The rubber sheet is drawn as lines over the shaded scene, with the same orthographic
// camera as the trace: a world point projects to (alpha, beta) = (y, -cos(incl) x + sin(incl) z),
// which the tilt then rotates onto the screen.
const SHEET_VERTEX_SOURCE = `#version 300 es
precision highp float;
const float W = ${f(WIDTH)};
const float H = ${f(HEIGHT)};
layout(location = 0) in vec3 aPosition;
uniform vec2 uCenter;
uniform float uTilt;
uniform float uIncl;
uniform float uUnit;
void main() {
  float alpha = aPosition.y;
  float beta = -cos(uIncl) * aPosition.x + sin(uIncl) * aPosition.z;
  float screenX = alpha * cos(uTilt) - beta * sin(uTilt);
  float screenY = alpha * sin(uTilt) + beta * cos(uTilt);
  float px = uCenter.x + screenX * uUnit;
  float py = uCenter.y - screenY * uUnit;
  gl_Position = vec4(px / W * 2.0 - 1.0, 1.0 - py / H * 2.0, 0.0, 1.0);
}
`

const SHEET_FRAGMENT_SOURCE = `#version 300 es
precision highp float;
out vec4 outColor;
void main() {
  outColor = vec4(0.4, 1.0, 0.75, 1.0) * 0.6;
}
`

const COMPOSITE_SOURCE = `${SHADER_HEAD}
uniform sampler2D uScene;
uniform float uBloom;
uniform float uShadowPx;
uniform float uHorizonPx;
uniform float uPhotonPx;
uniform float uPhotonRetroPx;
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
  if (uPhotonPx > 0.0) {
    // 1px ring at the equatorial photon orbit (prograde when the hole spins)
    float ring = abs(length(pixelCoord() - vec2(CX, CY)) - uPhotonPx);
    color = mix(color, vec3(1.0, 0.45, 0.35), clamp(1.0 - ring, 0.0, 1.0));
  }
  if (uPhotonRetroPx > 0.0) {
    // the retrograde orbit of a spinning hole, a little fainter
    float ring = abs(length(pixelCoord() - vec2(CX, CY)) - uPhotonRetroPx);
    color = mix(color, vec3(1.0, 0.45, 0.35), 0.7 * clamp(1.0 - ring, 0.0, 1.0));
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
// disk texture, and the volume quality its target, so they jump at the end instead of animating.
const RESET_MS = 800
const RESET_KEYS = {
  bloom, speed, orbit, zoom, massLog, temperature, brightness, roll, pitch, yaw, rIn, rOut, spin, thickness, density, starBrightness, starAmount, accretionLog, orbiterOrbit,
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
  showPhoton.value = DEFAULTS.showPhoton
  showGrid.value = DEFAULTS.showGrid
  gridSize.value = DEFAULTS.gridSize
  gridLines.value = DEFAULTS.gridLines
  showGridX.value = DEFAULTS.showGridX
  showGridY.value = DEFAULTS.showGridY
  showGridZ.value = DEFAULTS.showGridZ
  showGridStack.value = DEFAULTS.showGridStack
  showSheet.value = DEFAULTS.showSheet
  showShift.value = DEFAULTS.showShift
  sheetSize.value = DEFAULTS.sheetSize
  volumetric.value = DEFAULTS.volumetric
  showStars.value = DEFAULTS.showStars
  showJets.value = DEFAULTS.showJets
  showOrbiter.value = DEFAULTS.showOrbiter
  showOrbiterEarth.value = DEFAULTS.showOrbiterEarth
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
    quality.value = DEFAULTS.quality
    resizeVolume()
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

// Tileable 3D value noise for the volumetric gas: fractal noise from lattices of 4, 8, 16 and 32
// cells across one tile, wrapped so the tile repeats without a seam. One tile is NOISE_PERIOD
// wide along the radius and the height, in units of GM/c^2 (the Detail slider rescales it), so
// the coarsest cells are 3 M at the default detail and the finest 0.4 M. The value is stored as a byte.
const NOISE_SIZE = 128
const NOISE_CELLS = [4, 8, 16, 32]
const NOISE_PERIOD = 12

function buildNoiseVolume() {
  const octaves = NOISE_CELLS.map((cells, index) => {
    const lattice = new Float32Array(cells ** 3)
    for (let i = 0; i < lattice.length; i += 1) {
      lattice[i] = hash(i % cells, Math.floor(i / cells) % cells, Math.floor(i / (cells * cells)) + index * 97)
    }
    const first = new Uint16Array(NOISE_SIZE)
    const second = new Uint16Array(NOISE_SIZE)
    const weight = new Float32Array(NOISE_SIZE)
    for (let i = 0; i < NOISE_SIZE; i += 1) {
      const position = i * cells / NOISE_SIZE
      const cell = Math.floor(position)
      const fraction = position - cell
      first[i] = cell
      second[i] = (cell + 1) % cells
      weight[i] = fraction * fraction * (3 - 2 * fraction)
    }
    return { cells, lattice, first, second, weight, amplitude: 0.5 ** (index + 1) }
  })
  const total = octaves.reduce((sum, octave) => sum + octave.amplitude, 0)
  const data = new Uint8Array(NOISE_SIZE ** 3)
  let at = 0
  for (let k = 0; k < NOISE_SIZE; k += 1) {
    for (let j = 0; j < NOISE_SIZE; j += 1) {
      for (let i = 0; i < NOISE_SIZE; i += 1) {
        let sum = 0
        for (const { cells, lattice, first, second, weight, amplitude } of octaves) {
          const row = cells
          const plane = cells * cells
          const x0 = first[i]
          const x1 = second[i]
          const y0 = first[j] * row
          const y1 = second[j] * row
          const z0 = first[k] * plane
          const z1 = second[k] * plane
          const wx = weight[i]
          const wy = weight[j]
          const wz = weight[k]
          const low0 = lattice[z0 + y0 + x0] + (lattice[z0 + y0 + x1] - lattice[z0 + y0 + x0]) * wx
          const low1 = lattice[z0 + y1 + x0] + (lattice[z0 + y1 + x1] - lattice[z0 + y1 + x0]) * wx
          const high0 = lattice[z1 + y0 + x0] + (lattice[z1 + y0 + x1] - lattice[z1 + y0 + x0]) * wx
          const high1 = lattice[z1 + y1 + x0] + (lattice[z1 + y1 + x1] - lattice[z1 + y1 + x0]) * wx
          const low = low0 + (low1 - low0) * wy
          const high = high0 + (high1 - high0) * wy
          sum += amplitude * (low + (high - low) * wz)
        }
        data[at] = Math.round(255 * clamp(sum / total, 0, 1))
        at += 1
      }
    }
  }
  return data
}

function createNoiseTexture() {
  const texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_3D, texture)
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8, NOISE_SIZE, NOISE_SIZE, NOISE_SIZE, 0, gl.RED, gl.UNSIGNED_BYTE, buildNoiseVolume())
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.REPEAT)
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.REPEAT)
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.REPEAT)
  return texture
}

// What the volume pass needs per radius, so the shader does not evaluate the disk model per
// sample: the Novikov-Thorne flux (peak 1, as in the trace shader), and the orbital angular
// velocity and time dilation, which with a photon's angular momentum give the Doppler and
// gravitational shift. The same orbit physics as `record` in the trace shader.
function buildDiskProfile() {
  const a = spin.value
  const fluxSpin = Math.max(diskSpin.value, 0.001)
  const roots = fluxRoots(fluxSpin)
  const norm = 1 / (peakDiskFlux(fluxSpin, roots) || 1)
  const data = new Float32Array(TEXTURE_RADII * 4)
  for (let i = 0; i < TEXTURE_RADII; i += 1) {
    const radius = TEX_MIN + i * TEX_STEP
    const keplerian = 1 / (radius * Math.sqrt(radius) + a)
    const phiPhi = radius * radius + a * a + 2 * a * a / radius
    let omega = orbit.value * keplerian
    if (orbit.value > 1) {
      // matter cannot go faster than light: stop just short of u^t^-2 = 0.02, never below Keplerian
      const limit = (4 * a / radius
        + Math.sqrt(Math.max(16 * a * a / (radius * radius) + 4 * phiPhi * (1 - 2 / radius - 0.02), 0)))
        / (2 * phiPhi)
      omega = Math.min(omega, Math.max(keplerian, limit))
    }
    const radicand = 1 - 2 / radius + 4 * a * omega / radius - phiPhi * omega * omega
    data[i * 4] = diskFlux(radius, fluxSpin, roots) * norm
    data[i * 4 + 1] = omega
    data[i * 4 + 2] = 1 / Math.sqrt(Math.max(radicand, 0.02))
  }
  return data
}

function updateDiskProfile() {
  const key = `${spin.value}|${orbit.value}|${innerRadius.value}|${rOut.value}`
  if (key === profileKey) return
  profileKey = key
  gl.bindTexture(gl.TEXTURE_2D, profileTexture)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, TEXTURE_RADII, 1, 0, gl.RGBA, gl.FLOAT, buildDiskProfile())
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

function createProgram(fragmentSource, vertexSource = VERTEX_SOURCE) {
  const program = gl.createProgram()
  gl.attachShader(program, compileShader(gl.VERTEX_SHADER, vertexSource))
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
  if (!gl || busy.value || volumetric.value) return
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

  // the starfield needs a fifth render target for the sky direction; without it the stars are off
  starsAvailable.value = gl.getParameter(gl.MAX_DRAW_BUFFERS) >= 5
  traceProgram = createProgram(starsAvailable.value ? TRACE_STARS_SOURCE : TRACE_SOURCE)
  shadeProgram = createProgram(SHADE_SOURCE)
  compositeProgram = createProgram(COMPOSITE_SOURCE)
  downsampleProgram = createProgram(DOWNSAMPLE_SOURCE)
  blurProgram = createProgram(BLUR_SOURCE)
  sheetProgram = createProgram(SHEET_FRAGMENT_SOURCE, SHEET_VERTEX_SOURCE)
  sheetVao = gl.createVertexArray()
  gl.bindVertexArray(sheetVao)
  sheetBuffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, sheetBuffer)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0)
  gl.bindVertexArray(vao)

  // The thin disk's texture is only built when it is used, so it is skipped while the volume is on
  if (volumetric.value) {
    builtTexture = { detail: Number.NaN, contrast: Number.NaN }
    diskTexture = null
  } else {
    diskTexture = createDiskTexture()
  }
  volumeProgram = createProgram(VOLUME_SOURCE)
  noiseTexture = createNoiseTexture()
  profileTexture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, profileTexture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  volumeTarget = createVolumeTarget()

  traceFramebuffer = gl.createFramebuffer()
  gl.bindFramebuffer(gl.FRAMEBUFFER, traceFramebuffer)
  const attachments = []
  for (let index = 0; index < (starsAvailable.value ? 5 : 4); index += 1) {
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

function createVolumeTarget() {
  return createTarget([Math.ceil(WIDTH * quality.value), Math.ceil(HEIGHT * quality.value)])
}

function resizeVolume() {
  if (!gl || !volumeTarget) return
  if (volumeTarget.width === Math.ceil(WIDTH * quality.value)) return
  gl.deleteTexture(volumeTarget.texture)
  gl.deleteFramebuffer(volumeTarget.framebuffer)
  volumeTarget = createVolumeTarget()
  dirty = true
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
  gl.uniform1f(traceProgram.uniforms.uOrbit, orbit.value)
  gl.uniform1f(traceProgram.uniforms.uThin, volumetric.value ? 0 : 1)
  // radians of sky per unit of screen coordinate: STAR_FOV over the picture's height in pixels
  gl.uniform1f(traceProgram.uniforms.uStarFov, unit / HEIGHT * STAR_FOV)
  const fluxSpin = Math.max(diskSpin.value, 0.001)
  gl.uniform1f(traceProgram.uniforms.uFluxSpin, fluxSpin)
  const roots = fluxRoots(fluxSpin)
  gl.uniform4f(traceProgram.uniforms.uRoots, ...roots)
  gl.uniform1f(traceProgram.uniforms.uFluxNorm, 1 / (peakDiskFlux(fluxSpin, roots) || 1))
  const captureRadius = isNaked.value ? NAKED_CAPTURE_RADIUS : horizonRadius.value + HORIZON_MARGIN
  gl.uniform1f(traceProgram.uniforms.uCapture, 1 / captureRadius)
  // the cube keeps its size when lines are added: the spacing is the size over the number of cells
  gl.uniform1f(traceProgram.uniforms.uGridSpacing, showGrid.value ? gridSize.value / gridLines.value : 0)
  gl.uniform1f(traceProgram.uniforms.uGridExtent, gridSize.value / 2)
  gl.uniform3f(traceProgram.uniforms.uGridAxes, showGridX.value ? 1 : 0, showGridY.value ? 1 : 0, showGridZ.value ? 1 : 0)
  gl.uniform1f(traceProgram.uniforms.uGridStack, showGridStack.value ? 1 : 0)
  // about 1.2 screen pixels, in the same units as the lattice
  gl.uniform1f(traceProgram.uniforms.uGridWidth, 1.2 / unit)
  drawPass(traceFramebuffer)
}

// The disk's pattern is sheared by differential rotation, which grows without bound, so it is
// sampled at two phases that each wrap every cycle and are cross-faded (see the shade shader)
function diskPhases() {
  const cycle = (spinTime * SPIN_RATE) / SHEAR_CYCLE
  const cycleA = cycle - Math.floor(cycle)
  const cycleB = (cycle + 0.5) - Math.floor(cycle + 0.5)
  return { a: cycleA * SHEAR_CYCLE, b: cycleB * SHEAR_CYCLE, mix: Math.sin(Math.PI * cycleA) ** 2 }
}

// Marches every ray through the gas. Unlike the trace this runs each frame, because the gas
// moves, so its resolution is a share of the picture's.
function renderVolume() {
  updateDiskProfile()
  const { program, uniforms } = volumeProgram
  gl.useProgram(program)
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_3D, noiseTexture)
  gl.uniform1i(uniforms.uNoise, 0)
  bindTexture(1, profileTexture)
  gl.uniform1i(uniforms.uProfile, 1)
  gl.uniform2f(uniforms.uCenter, centerX, centerY)
  const view = viewAngles()
  gl.uniform1f(uniforms.uTilt, view.tilt)
  gl.uniform1f(uniforms.uIncl, view.incl)
  gl.uniform1f(uniforms.uUnit, unit)
  gl.uniform1f(uniforms.uRIn, innerRadius.value)
  gl.uniform1f(uniforms.uROut, rOut.value)
  gl.uniform1f(uniforms.uSpin, spin.value)
  const captureRadius = isNaked.value ? NAKED_CAPTURE_RADIUS : horizonRadius.value + HORIZON_MARGIN
  gl.uniform1f(uniforms.uCapture, 1 / captureRadius)
  // the jets reach further out than the gas
  const jetsOn = jetStrength.value > 0
  const bodyOrbit = orbiterRadius.value
  // a radius of 0 means that body is not drawn
  const sunSize = orbiterActive.value ? sunRadius.value : 0
  const earthSize = earthActive.value ? earthRadius.value : 0
  const bodySize = Math.max(sunSize, earthSize)
  const margin = 1.5 * WIDTH / (unit * volumeTarget.width)
  // the bodies' centres are a little above the disk plane, so they are slightly further than their orbit radius
  const bodyDistance = Math.hypot(bodyOrbit, bodySize * ORBITER_CLEARANCE)
  // rays are followed out as far as the bodies, if they are drawn
  const bodyReach = bodiesActive.value ? bodyDistance + bodySize + margin : 0
  gl.uniform1f(uniforms.uOutInv, 1 / Math.max(rOut.value, jetsOn ? JET_LENGTH : 0, bodyReach))
  // the body rides with the disk's pattern at its radius, which turns at (rIn / r)^SHEAR times SPIN_RATE
  gl.uniform1f(uniforms.uBodyOn, bodiesActive.value ? 1 : 0)
  gl.uniform2f(uniforms.uEarth, earthSize, earthAhead.value)
  gl.uniform3f(uniforms.uBody, bodyOrbit, sunSize,(spinTime * SPIN_RATE * (innerRadius.value / bodyOrbit) ** SHEAR) % TAU)
  gl.uniform2f(uniforms.uBodyBand, 1 / (bodyDistance + bodySize + margin), 1 / Math.max(bodyDistance - bodySize - margin, 0.05))
  gl.uniform1f(uniforms.uGasOutInv, 1 / rOut.value)
  gl.uniform1f(uniforms.uGas, volumetric.value ? 1 : 0)
  gl.uniform1f(uniforms.uJet, jetStrength.value)
  gl.uniform1f(uniforms.uJetPhase, (spinTime * JET_SPEED) % 12)
  gl.uniform1f(uniforms.uInInv, 1 / innerRadius.value)
  // the gas is negligible beyond about 3.5 scale heights, which bounds the wedge worth sampling
  gl.uniform1f(uniforms.uZCut, Math.min(1, 3.5 * thickness.value + 0.02))
  gl.uniform1f(uniforms.uThick, thickness.value)
  gl.uniform1f(uniforms.uDensity, density.value)
  gl.uniform1f(uniforms.uContrast, contrast.value)
  gl.uniform1f(uniforms.uNoiseScale, detail.value / 8 / NOISE_PERIOD)
  // a whole number of tiles around the hole, so the noise has no seam
  gl.uniform1f(uniforms.uAzimuthCycles, Math.max(1, Math.round(detail.value * 0.8)))
  const phases = diskPhases()
  gl.uniform1f(uniforms.uPhaseA, phases.a)
  gl.uniform1f(uniforms.uPhaseB, phases.b)
  gl.uniform1f(uniforms.uMixA, phases.mix)
  gl.uniform1f(uniforms.uPeakTemp, PEAK_TEMP_WARM + (PEAK_TEMP_COOL - PEAK_TEMP_WARM) * temperature.value)
  gl.uniform1f(uniforms.uVolScale, volumeTarget.width / WIDTH)
  drawPass(volumeTarget.framebuffer, volumeTarget.width, volumeTarget.height)
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
  bindTexture(5, volumeNeeded.value ? volumeTarget.texture : null)
  gl.uniform1f(uniforms.uVolumeOn, volumeNeeded.value ? 1 : 0)
  gl.uniform1i(uniforms.uVolume, 5)
  gl.uniform1f(uniforms.uVolumetric, volumetric.value ? 1 : 0)
  gl.uniform1f(uniforms.uBodyOn, bodiesActive.value ? 1 : 0)
  bindTexture(6, traceTextures[4] ?? null)
  gl.uniform1i(uniforms.uTrace4, 6)
  gl.uniform1f(uniforms.uStars, starsAvailable.value && showStars.value ? starBrightness.value : 0)
  gl.uniform1f(uniforms.uStarAmount, starAmount.value)
  gl.uniform2f(uniforms.uCenter, centerX, centerY)
  gl.uniform1f(uniforms.uTilt, viewAngles().tilt)
  gl.uniform1f(uniforms.uUnit, unit)
  gl.uniform1f(uniforms.uShadowPx, shadowPx)
  const phases = diskPhases()
  gl.uniform1f(uniforms.uPhaseA, phases.a)
  gl.uniform1f(uniforms.uPhaseB, phases.b)
  gl.uniform1f(uniforms.uMixA, phases.mix)
  gl.uniform1f(uniforms.uTemperature, temperature.value)
  gl.uniform1f(uniforms.uBrightness, brightness.value)
  gl.uniform1f(uniforms.uPeakTemp, PEAK_TEMP_WARM + (PEAK_TEMP_COOL - PEAK_TEMP_WARM) * temperature.value)
  gl.uniform1f(uniforms.uShift, showShift.value ? 1 : 0)
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
  gl.uniform1f(uniforms.uPhotonPx, showPhoton.value && photonPrograde.value > 0 ? photonPrograde.value * unit : 0)
  gl.uniform1f(uniforms.uPhotonRetroPx, showPhoton.value && spin.value > 0.01 ? photonRetrograde.value * unit : 0)
  gl.uniform1f(uniforms.uSunPx, showSun.value ? sunRadius.value * unit : 0)
  gl.uniform1f(uniforms.uEarthPx, showEarth.value ? earthRadius.value * unit : 0)
  gl.uniform1f(uniforms.uSolarSystemPx, showSolarSystem.value ? solarSystemRadius.value * unit : 0)
  drawPass(null)
}

// Embedding diagram of the equatorial plane: the surface whose own (flat) geometry matches
// the curved space there, like a heavy ball on a rubber sheet. With the radial proper
// distance dl = sqrt(g_rr) dr and circumference 2 pi r, the depth follows
// dz/dr = sqrt(r^2 / Delta - 1) with Delta = r^2 - 2 r + a^2. For no spin this is Flamm's
// paraboloid z = 2 sqrt(2 (r - 2)); with spin it is only an approximation, because the
// circumference is not exactly 2 pi r. Substituting r = r+ + t^2 removes the singularity
// at the horizon: dz/dt = 2 sqrt((2 r - a^2) / (r - r-)).
const SHEET_RINGS = 14
const SHEET_SPOKES = 24
const SHEET_STEPS = 80
const SHEET_AROUND = 96
const SHEET_PROFILE = 400

function buildSheet() {
  const a = spin.value
  const naked = a > 1
  const root = naked ? 0 : Math.sqrt(1 - a * a)
  // without a horizon the embedding starts where 2 r = a^2 (zero slope), not at r+
  const rPlus = naked ? a * a / 2 : 1 + root
  const rMinus = 1 - root
  const extent = sheetSize.value
  const tMax = Math.sqrt(extent - rPlus)
  const slope = (t) => {
    const r = rPlus + t * t
    // (2 r - a^2) = 2 t^2 for the naked case, which keeps the slope finite at t = 0
    if (naked) return 2 * Math.SQRT2 * t * t / Math.sqrt(r * r - 2 * r + a * a)
    return 2 * Math.sqrt((2 * r - a * a) / (r - rMinus))
  }
  const profile = new Float64Array(SHEET_PROFILE + 1)
  const dt = tMax / SHEET_PROFILE
  for (let i = 1; i <= SHEET_PROFILE; i += 1) {
    const t = (i - 1) * dt
    profile[i] = profile[i - 1] + dt * (slope(t) + 4 * slope(t + dt / 2) + slope(t + dt)) / 6
  }
  // The throat sits at the hole (z = 0) and the sheet flares up from it, so the hole is at the bottom of the well
  const height = (t) => {
    const position = Math.min(SHEET_PROFILE, t / dt)
    const index = Math.min(SHEET_PROFILE - 1, Math.floor(position))
    const depth = profile[index] + (profile[index + 1] - profile[index]) * (position - index)
    return depth
  }
  const point = (t, angle) => {
    const r = rPlus + t * t
    return [r * Math.cos(angle), r * Math.sin(angle), height(t)]
  }

  const vertices = []
  for (let k = 0; k <= SHEET_RINGS; k += 1) {
    const t = Math.sqrt((extent - rPlus) * k / SHEET_RINGS)
    for (let i = 0; i < SHEET_AROUND; i += 1) {
      vertices.push(...point(t, TAU * i / SHEET_AROUND), ...point(t, TAU * (i + 1) / SHEET_AROUND))
    }
  }
  for (let j = 0; j < SHEET_SPOKES; j += 1) {
    const angle = TAU * j / SHEET_SPOKES
    for (let i = 0; i < SHEET_STEPS; i += 1) {
      vertices.push(...point(tMax * i / SHEET_STEPS, angle), ...point(tMax * (i + 1) / SHEET_STEPS, angle))
    }
  }
  return new Float32Array(vertices)
}

function drawSheet() {
  if (!showSheet.value) return
  gl.bindVertexArray(sheetVao)
  const key = `${spin.value}|${sheetSize.value}`
  if (key !== sheetKey) {
    const data = buildSheet()
    gl.bindBuffer(gl.ARRAY_BUFFER, sheetBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW)
    sheetCount = data.length / 3
    sheetKey = key
  }
  const { program, uniforms } = sheetProgram
  gl.useProgram(program)
  const view = viewAngles()
  gl.uniform2f(uniforms.uCenter, centerX, centerY)
  gl.uniform1f(uniforms.uTilt, view.tilt)
  gl.uniform1f(uniforms.uIncl, view.incl)
  gl.uniform1f(uniforms.uUnit, unit)
  gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFramebuffer)
  gl.viewport(0, 0, WIDTH, HEIGHT)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.ONE, gl.ONE)
  gl.drawArrays(gl.LINES, 0, sheetCount)
  gl.disable(gl.BLEND)
  gl.bindVertexArray(vao)
}

function drawFrame() {
  if (needsTrace) {
    traceRays()
    needsTrace = false
  }
  if (volumeNeeded.value) renderVolume()
  shadeScene()
  drawSheet()
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
