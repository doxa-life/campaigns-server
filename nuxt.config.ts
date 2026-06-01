// https://nuxt.com/docs/api/configuration/nuxt-config
import { fileURLToPath } from 'node:url'
import { generateI18nLocales } from './config/languages'

const appTitle = process.env.APP_TITLE || 'Base'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  ssr: false,

  vue: {
    compilerOptions: {
      isCustomElement: (tag: string) => tag === 'feedback-web-component'
    }
  },

  // Keep the file watcher out of large non-source trees (e.g. agent git
  // worktrees under .claude/worktrees/, each carrying their own node_modules).
  // Without this the core builder watcher walks them and hits EMFILE.
  ignore: ['**/.claude/**', '**/wip/**'],
  watchers: {
    chokidar: {
      ignored: ['**/.claude/**', '**/wip/**']
    }
  },

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

  modules: ['@nuxtjs/i18n', '@nuxt/icon', '@nuxt/ui'],

  ui: {
    theme: {
      colors: ['primary', 'secondary', 'info', 'success', 'warning', 'error', 'neutral', 'kashmir-blue', 'brand-slate', 'brand-success', 'brand-warning', 'brand-error', 'brand-info']
    }
  },

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
      ignored: ['**/.claude/**']
    },
    imports: {
      // Exclude server/utils/app from auto-imports to avoid conflicts with base layer
      // These utilities are accessed through server/utils re-exports only
      exclude: [
        '**/server/utils/app/**'
      ]
    }
  },

  watch: ['!.claude/**'],

  vite: {
    server: {
      watch: {
        ignored: ['**/.claude/**']
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
    emailProvider: process.env.EMAIL_PROVIDER || 'smtp',
    smtpHost: process.env.SMTP_HOST || 'localhost',
    smtpPort: process.env.SMTP_PORT || '1025',
    smtpUser: process.env.SMTP_USER || '',
    smtpPass: process.env.SMTP_PASS || '',
    smtpFrom: process.env.SMTP_FROM || 'noreply@localhost.com',
    smtpFromName: process.env.SMTP_FROM_NAME || '',
    smtpSecure: process.env.SMTP_SECURE || 'false',
    smtpRejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED || 'true',

    // AWS SES configuration (base layer)
    awsRegion: process.env.AWS_REGION || process.env.AWS_SES_REGION || '',
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',

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

    // Mailgun shared-inbox transport + inbound/delivery webhooks
    mailgunApiKey: process.env.MAILGUN_API_KEY || '',
    mailgunDomain: process.env.MAILGUN_DOMAIN || '',
    mailgunHost: process.env.MAILGUN_HOST || 'api.mailgun.net',
    mailgunWebhookSigningKey: process.env.MAILGUN_WEBHOOK_SIGNING_KEY || '',
    inboxContactAddress: process.env.INBOX_CONTACT_ADDRESS || 'contact@doxa.life',
    inboxDomain: process.env.INBOX_DOMAIN || 'doxa.life',

    // Marketing email transport — separate Mailgun domain + key so marketing
    // sends on its own subdomain reputation, isolated from transactional/inbox.
    marketingMailgunApiKey: process.env.MARKETING_MAILGUN_API_KEY || '',
    marketingMailgunDomain: process.env.MARKETING_MAILGUN_DOMAIN || '',
    marketingMailgunHost: process.env.MARKETING_MAILGUN_HOST || 'api.mailgun.net',
    // Secret for signing reply-by-email addresses (contact+<token>.<sig>@). Falls back to JWT secret.
    inboxReplySecret: process.env.INBOX_REPLY_SECRET || process.env.JWT_SECRET || '',

    // Shared secret bundled into the mobile app for anonymous + news signup
    anonSignupSecret: process.env.ANON_SIGNUP_SECRET || '',

    // Statinator analytics
    statinatorApiKey: process.env.STATINATOR_API_KEY || '',

    // Public keys (exposed to the frontend)
    public: {
      appName: appTitle,
      nodeEnv: process.env.NODE_ENV || 'development',
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000',
      baseUrl: process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000',
      // Inbox sending identity (used by the composer's From selector)
      inboxContactAddress: process.env.INBOX_CONTACT_ADDRESS || 'contact@doxa.life',
      inboxDomain: process.env.INBOX_DOMAIN || 'doxa.life',
      statinatorUrl: process.env.NUXT_PUBLIC_STATINATOR_URL || 'https://statinator.doxa.life',
      statinatorProjectId: process.env.NUXT_PUBLIC_STATINATOR_PROJECT_ID || 'doxa',
      statinatorEnabled: process.env.NUXT_PUBLIC_STATINATOR_ENABLED === 'true',
      statinatorCookieDomain: process.env.NUXT_PUBLIC_STATINATOR_COOKIE_DOMAIN || '.doxa.life',

      // Feedback widget (external chat bubble → support.gospelambition.org)
      feedbackApiBase: process.env.NUXT_PUBLIC_FEEDBACK_API_BASE || 'https://support.gospelambition.org',
      feedbackProjectId: process.env.NUXT_PUBLIC_FEEDBACK_PROJECT_ID || ''
    }
  }
})
