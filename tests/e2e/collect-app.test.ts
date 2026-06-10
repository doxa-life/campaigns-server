import { describe, it, expect } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'

const SECRET = process.env.ANON_SIGNUP_SECRET || ''
if (!SECRET) {
  throw new Error('ANON_SIGNUP_SECRET must be set in .env to run these tests (forwarded via vitest.config.ts)')
}
const headers = { 'x-app-secret': SECRET }

// The endpoint relays to Statinator (unreachable in tests) fire-and-forget, so
// we assert the parts the relay owns: app-secret auth, validation, and the
// fast 202 ack. The upstream forward is swallowed on failure by design.
describe('POST /api/collect/app', () => {
  describe('Auth', () => {
    it('returns 403 without the app secret', async () => {
      const error = await $fetch('/api/collect/app', {
        method: 'POST',
        body: { event_type: 'app_open' }
      }).catch(e => e)
      expect(error.statusCode).toBe(403)
    })

    it('returns 403 with a wrong secret', async () => {
      const error = await $fetch('/api/collect/app', {
        method: 'POST',
        headers: { 'x-app-secret': 'wrong-secret' },
        body: { event_type: 'app_open' }
      }).catch(e => e)
      expect(error.statusCode).toBe(403)
    })
  })

  describe('Validation', () => {
    it('returns 400 for an unsupported event_type', async () => {
      const error = await $fetch('/api/collect/app', {
        method: 'POST',
        headers,
        body: { event_type: 'not_allowed' }
      }).catch(e => e)
      expect(error.statusCode).toBe(400)
    })

    it('returns 400 for a missing event_type', async () => {
      const error = await $fetch('/api/collect/app', {
        method: 'POST',
        headers,
        body: {}
      }).catch(e => e)
      expect(error.statusCode).toBe(400)
    })

    it('returns 413 when metadata exceeds the size cap', async () => {
      const error = await $fetch('/api/collect/app', {
        method: 'POST',
        headers,
        body: { event_type: 'app_open', metadata: { blob: 'x'.repeat(9 * 1024) } }
      }).catch(e => e)
      expect(error.statusCode).toBe(413)
    })
  })

  describe('Accepted events', () => {
    it('accepts app_open with metadata and returns 202 ok', async () => {
      const res = await $fetch('/api/collect/app', {
        method: 'POST',
        headers,
        body: {
          event_type: 'app_open',
          anonymous_hash: '11111111-2222-3333-4444-555555555555',
          language: 'en',
          metadata: { platform: 'ios', app_version: '1.2.3', people_group_slug: 'shaikh-bangladesh' }
        }
      })
      expect(res).toEqual({ ok: true })
    })

    it('accepts language_switched', async () => {
      const res = await $fetch('/api/collect/app', {
        method: 'POST',
        headers,
        body: {
          event_type: 'language_switched',
          anonymous_hash: '11111111-2222-3333-4444-555555555555',
          language: 'es'
        }
      })
      expect(res).toEqual({ ok: true })
    })
  })
})
