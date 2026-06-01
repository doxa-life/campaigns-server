import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'url'

export default defineConfig({
  plugins: [vue()],
  define: {
    'import.meta.client': true,
    'import.meta.server': false,
  },
  test: {
    environment: 'happy-dom',
    include: ['tests/unit/**/*.test.ts'],
    setupFiles: ['tests/unit/setup.ts'],
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./app', import.meta.url)),
      '@': fileURLToPath(new URL('./app', import.meta.url)),
      '#imports': fileURLToPath(new URL('./tests/unit/nuxt-imports-mock.ts', import.meta.url)),
    },
  },
})
