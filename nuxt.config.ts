// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  runtimeConfig: {
    public: {
      // Set via NUXT_PUBLIC_GA_MEASUREMENT_ID (e.g. G-XXXXXXXXXX); analytics is off when empty
      gaMeasurementId: 'G-E96TCJ70KL',
    },
  },
  app: {
    head: {
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg?v=2' },
      ],
    },
  },
})
