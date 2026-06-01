import { defineVitestConfig } from '@nuxt/test-utils/config'
import { loadEnv } from 'vite'

// Load .env file
const env = loadEnv('test', process.cwd(), '')

// Use TEST_DATABASE_URL for both the server and test helpers
if (env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = env.TEST_DATABASE_URL
  process.env.TEST_DATABASE_URL = env.TEST_DATABASE_URL
}

// Pass JWT_SECRET to test environment for auth helpers
if (env.JWT_SECRET) {
  process.env.JWT_SECRET = env.JWT_SECRET
}

// Pass signup secrets so tests can send the required headers
if (env.ANON_SIGNUP_SECRET) {
  process.env.ANON_SIGNUP_SECRET = env.ANON_SIGNUP_SECRET
}
if (env.FORM_API_KEY) {
  process.env.FORM_API_KEY = env.FORM_API_KEY
}

export default defineVitestConfig({
  // Externalize bun:test to avoid bundling issues
  resolve: {
    alias: {
      'bun:test': 'vitest',
    },
  },
  test: {
    environment: 'nuxt',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/unit/**'],
    testTimeout: 60000,
    // Setup hooks clean DB state and bcrypt-hash users; the 10s default is too
    // tight under CI load and caused flaky "Hook timed out" failures.
    hookTimeout: 60000,
    globalSetup: ['tests/e2e/global-setup.ts'],
    fileParallelism: false,
    sequence: {
      hooks: 'list',
    },
  },
})
