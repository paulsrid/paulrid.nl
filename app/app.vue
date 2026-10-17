<script setup lang="ts">
const title = 'Blackhole simulation'
const description = 'An interactive real-time black hole simulation built with WebGL. Explore gravitational lensing and the accretion disk right in your browser.'

useHead({ title })
useSeoMeta({
  description,
  ogTitle: title,
  ogDescription: description,
})
</script>
<template>
  <BlackHole />
</template>
