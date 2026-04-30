// https://nuxt.com/docs/api/configuration/nuxt-config
import { fileURLToPath } from 'node:url'
import { existsSync, readdirSync, rmSync } from 'node:fs'
import { extname, join } from 'node:path'
import { generateI18nLocales } from './config/languages'

const appTitle = process.env.APP_TITLE || 'Base'
const baseLayerUrl = process.env.BASE_LAYER_URL || 'github:corsacca/nuxt-base#master'

const LAYERS_DIR = '.layers'

// Strip layer-level tsconfig.json files. The nuxt-base layer ships a
// tsconfig.json that references ./.nuxt/tsconfig.*.json — only generated when
// the layer is opened as its own project. Under node_modules Vite skips it;
// at .layers/<name> Vite picks it up and crashes on the missing references.
function stripLayerTsconfigs() {
  if (!existsSync(LAYERS_DIR)) return
  for (const name of readdirSync(LAYERS_DIR)) {
    const tsconfig = join(LAYERS_DIR, name, 'tsconfig.json')
    if (existsSync(tsconfig)) rmSync(tsconfig)
  }
}

stripLayerTsconfigs()

const isRemoteLayer = /^(github|gitlab|bitbucket|sourcehut|npm|https?):/.test(baseLayerUrl)

export default defineNuxtConfig({
  // Testing local base layer changes (switch back to github:corsacca/nuxt-base#TAG before deploying)
  extends: [
    isRemoteLayer
      ? [baseLayerUrl, { giget: { dir: `${LAYERS_DIR}/nuxt-base`, forceClean: true } }]
      : baseLayerUrl
  ],

  hooks: {
    'modules:before': stripLayerTsconfigs
  },

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
      ignored: ['**/node_modules/.c12/**', '**/.layers/**']
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
            if ((source.includes('.layers/') || source.includes('.c12')) && !extname(source)) {
              const tsPath = source + '.ts'
              if (existsSync(tsPath)) return tsPath
            }
            return null
          }
        }
      ]
    }
  },

  watch: ['!node_modules/.c12/**', '!.layers/**'],

  vite: {
    server: {
      watch: {
        ignored: ['**/node_modules/.c12/**', '**/.layers/**']
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

    // Anthropic AI API
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',

    // Form API key for external form submissions (WordPress, etc.)
    formApiKey: process.env.FORM_API_KEY || '',

    // Statinator analytics
    statinatorApiKey: process.env.STATINATOR_API_KEY || '',

    // Public keys (exposed to the frontend)
    public: {
      appName: appTitle,
      nodeEnv: process.env.NODE_ENV || 'development',
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000',
      statinatorUrl: process.env.NUXT_PUBLIC_STATINATOR_URL || 'https://statinator.doxa.life',
      statinatorProjectId: process.env.NUXT_PUBLIC_STATINATOR_PROJECT_ID || 'doxa',
      statinatorEnabled: process.env.NUXT_PUBLIC_STATINATOR_ENABLED === 'true',
      statinatorCookieDomain: process.env.NUXT_PUBLIC_STATINATOR_COOKIE_DOMAIN || '.doxa.life'
    }
  }
})
