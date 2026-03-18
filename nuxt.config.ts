// https://nuxt.com/docs/api/configuration/nuxt-config
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { extname } from 'node:path'
import { generateI18nLocales } from './config/languages'

const appTitle = process.env.APP_TITLE || 'Base'
const baseLayerUrl = process.env.BASE_LAYER_URL || 'github:corsacca/nuxt-base#master'

export default defineNuxtConfig({
  // Testing local base layer changes (switch back to github:corsacca/nuxt-base#TAG before deploying)
  extends: [baseLayerUrl], //  'github:corsacca/nuxt-base#master'

  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  ssr: false,

  css: ['~/assets/css/main.css'],

  app: {
    head: {
      title: appTitle,
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' }
      ]
    }
  },

  modules: ['@nuxtjs/i18n', '@nuxt/icon'],

  i18n: {
    locales: generateI18nLocales(),
    defaultLocale: 'en',
    langDir: 'locales',
    strategy: 'prefix_except_default',
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'preferred_language',
      redirectOn: 'root',
      alwaysRedirect: true
    },
    vueI18n: './i18n.config.ts'
  },

  alias: {
    '#server': fileURLToPath(new URL('./server', import.meta.url))
  },

  routeRules: {
    '/en/**': { redirect: '/**' }
  },

  nitro: {
    watchOptions: {
      ignored: ['**/node_modules/.c12/**']
    },
    imports: {
      // Exclude server/utils/app from auto-imports to avoid conflicts with base layer
      // These utilities are accessed through server/utils re-exports only
      exclude: [
        '**/server/utils/app/**'
      ]
    },
    rollupConfig: {
      plugins: [
        {
          name: 'resolve-base-layer-ts',
          resolveId(source: string) {
            if (source.includes('.c12') && !extname(source)) {
              const tsPath = source + '.ts'
              if (existsSync(tsPath)) return tsPath
            }
            return null
          }
        }
      ]
    }
  },

  watch: {
    exclude: ['node_modules/.c12/**']
  },

  vite: {
    server: {
      watch: {
        ignored: ['**/node_modules/.c12/**']
      }
    },
    optimizeDeps: {
      include: [
        '@tiptap/pm/state',
        '@tiptap/pm/view',
        '@tiptap/pm/model',
        '@tiptap/pm/transform',
        '@tiptap/pm/commands',
        '@tiptap/pm/schema-list',
        '@tiptap/pm/dropcursor',
        '@tiptap/pm/gapcursor',
        '@tiptap/pm/history'
      ]
    }
  },

  runtimeConfig: {
    // Private keys (only available on the server-side)
    // Base layer config
    appName: appTitle,
    jwtSecret: process.env.JWT_SECRET,
    databaseUrl: process.env.DATABASE_URL || '',

    // Email configuration (base layer)
    smtpHost: process.env.SMTP_HOST || 'localhost',
    smtpPort: process.env.SMTP_PORT || '1025',
    smtpUser: process.env.SMTP_USER || '',
    smtpPass: process.env.SMTP_PASS || '',
    smtpFrom: process.env.SMTP_FROM || 'noreply@localhost.com',
    smtpSecure: process.env.SMTP_SECURE || 'false',
    smtpRejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED || 'true',

    // S3 configuration (base layer)
    s3Endpoint: process.env.S3_ENDPOINT || '',
    s3Region: process.env.S3_REGION || '',
    s3AccessKeyId: process.env.S3_ACCESS_KEY_ID || '',
    s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
    s3BucketName: process.env.S3_BUCKET_NAME || process.env.S3_BACKUP_BUCKET || '',

    // DeepL Translation API
    deeplApiKey: process.env.DEEPL_API_KEY || '',
    deeplApiUrl: process.env.DEEPL_API_URL || 'https://api-free.deepl.com',

    // Form API key for external form submissions (WordPress, etc.)
    formApiKey: process.env.FORM_API_KEY || '',

    // Public keys (exposed to the frontend)
    public: {
      appName: appTitle,
      nodeEnv: process.env.NODE_ENV || 'development',
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    }
  }
})
