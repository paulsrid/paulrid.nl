<script setup lang="ts">
const siteUrl = 'https://paulrid.nl'
const title = 'Interactive Black Hole Simulation (WebGL) | Paul Rid'
const description = 'An interactive real-time black hole simulation built with WebGL. Explore gravitational lensing and the accretion disk right in your browser.'

useHead({
  title,
  htmlAttrs: { lang: 'en' },
  link: [{ rel: 'canonical', href: `${siteUrl}/` }],
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'WebSite',
            '@id': `${siteUrl}/#website`,
            url: `${siteUrl}/`,
            name: 'Paul Rid',
            inLanguage: 'en',
            publisher: { '@id': `${siteUrl}/#person` },
          },
          {
            '@type': 'Person',
            '@id': `${siteUrl}/#person`,
            name: 'Paul Rid',
            url: `${siteUrl}/`,
          },
          {
            '@type': 'WebApplication',
            '@id': `${siteUrl}/#app`,
            name: 'Black hole simulation',
            url: `${siteUrl}/`,
            description,
            applicationCategory: 'EducationalApplication',
            operatingSystem: 'Any (requires a WebGL2 capable browser)',
            browserRequirements: 'Requires WebGL2',
            isAccessibleForFree: true,
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
            author: { '@id': `${siteUrl}/#person` },
          },
        ],
      }),
    },
  ],
})
useSeoMeta({
  description,
  ogTitle: title,
  ogDescription: description,
  ogType: 'website',
  ogUrl: `${siteUrl}/`,
  ogSiteName: 'Paul Rid',
  ogImage: `${siteUrl}/og.png`,
  ogImageWidth: 1242,
  ogImageHeight: 629,
  ogImageAlt: 'Ray-traced spinning black hole with a glowing accretion disk',
  twitterCard: 'summary_large_image',
  twitterTitle: title,
  twitterDescription: description,
  twitterImage: `${siteUrl}/og.png`,
})
</script>
<template>
  <main>
    <header class="seo-text">
      <h1>Interactive black hole simulation</h1>
      <p>
        A real-time, ray-traced simulation of a spinning (Kerr) black hole that runs entirely in
        your browser with WebGL2. Every pixel traces a light ray backwards from the camera and
        bends it through curved spacetime, producing gravitational lensing, the black shadow, and
        the glowing accretion disk, including the arc of the far side of the disk bent over the
        top and under the hole.
      </p>
      <p>
        You can change the spin, the mass (from 1 to 66 billion solar masses), the viewing angle
        and the disk properties, compare the event horizon with scale rings for the Earth, the Sun
        and the orbit of Neptune, and drag to rotate or scroll to zoom. The disk follows the
        Novikov-Thorne model, with blackbody colours shifted by the Doppler effect and
        gravitational redshift. The method follows James et al. (2015), "Gravitational lensing by
        spinning black holes in astrophysics, and in the movie Interstellar".
      </p>
    </header>
    <BlackHole />
    <noscript>
      <p>This black hole simulation needs JavaScript and a WebGL2 capable browser.</p>
    </noscript>
  </main>
</template>

<style>
.seo-text {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
