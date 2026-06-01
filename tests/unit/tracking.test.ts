import { beforeEach, describe, expect, it, vi } from 'vitest'
import { trackEvent, userHashFromEmail } from '../../server/utils/tracking'

const mockFetch = vi.fn()

describe('server tracking helper', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    vi.stubGlobal('$fetch', mockFetch)
    vi.stubGlobal('useRuntimeConfig', () => ({
      statinatorApiKey: 'test-key',
      public: {
        siteUrl: 'https://pray.doxa.life',
        statinatorUrl: 'https://statinator.doxa.life',
        statinatorProjectId: 'doxa'
      }
    }))
  })

  it('normalizes and hashes email addresses', () => {
    expect(userHashFromEmail(' Test@Example.COM ')).toBe(
      userHashFromEmail('test@example.com')
    )
  })

  it('does not send when server config is disabled', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({
      statinatorApiKey: '',
      public: {
        siteUrl: 'https://pray.doxa.life',
        statinatorUrl: 'https://statinator.doxa.life',
        statinatorProjectId: 'doxa'
      }
    }))

    await trackEvent(undefined, { eventType: 'subscriber_signup' })

    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('does not throw when the tracking request fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network failed'))

    await expect(trackEvent(undefined, { eventType: 'subscriber_signup' })).resolves.toBeUndefined()
  })

  it('removes raw PII fields from metadata', async () => {
    await trackEvent(undefined, {
      eventType: 'contact_form_submitted',
      email: 'test@example.com',
      metadata: {
        source: 'contact_form',
        country: 'US',
        email: 'test@example.com',
        phone: '+15555550100',
        name: 'Test Person',
        message: 'hello',
        profile_id: 'secret-profile-id',
        token: 'secret-token'
      }
    })

    const body = mockFetch.mock.calls[0][1].body

    expect(body.metadata).toEqual({
      source: 'contact_form',
      country: 'US'
    })
    expect(body.user_hash).toBe(userHashFromEmail('test@example.com'))
  })
})
