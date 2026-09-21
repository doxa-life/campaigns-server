import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { sendEmail } from '../../server/utils/email'
import { sendPrayerReminderEmail } from '../../server/utils/prayer-reminder-email'

// Every send goes to the SendGrid v3 API through a stubbed fetch; the tests
// assert on the JSON payload it receives.
const sent: Array<Record<string, any>> = []

beforeAll(() => {
  process.env.EMAIL_PROVIDER = 'sendgrid'
  process.env.SENDGRID_API_KEY = 'test-key'
  // The reminder module reaches sendEmail through Nuxt's server auto-imports.
  vi.stubGlobal('sendEmail', sendEmail)
  vi.stubGlobal('useRuntimeConfig', () => ({
    public: { siteUrl: 'https://pray.test' },
    appName: 'Prayer Tools',
    smtpFrom: 'noreply@pray.test',
    smtpFromName: 'Doxa Prayer',
  }))
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)))
    return new Response('', { status: 202, headers: { 'x-message-id': 'sg-test-id' } })
  }))
})

beforeEach(() => {
  sent.length = 0
})

afterAll(() => {
  vi.unstubAllGlobals()
  delete process.env.EMAIL_PROVIDER
  delete process.env.SENDGRID_API_KEY
})

describe('sendEmail headers', () => {
  it('forwards custom headers to the SendGrid payload', async () => {
    const ok = await sendEmail({
      to: 'someone@example.com',
      subject: 'Hi',
      html: '<p>Hi</p>',
      headers: { 'X-Example': 'yes' },
    })
    expect(ok).toBe(true)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.headers).toEqual({ 'X-Example': 'yes' })
  })

  it('omits the headers field when none are given', async () => {
    await sendEmail({ to: 'someone@example.com', subject: 'Hi', html: '<p>Hi</p>' })
    expect(sent[0]!.headers).toBeUndefined()
  })
})

describe('sendPrayerReminderEmail', () => {
  it('marks the reminder as machine-generated so auto-responders stay quiet', async () => {
    const ok = await sendPrayerReminderEmail({
      to: 'subscriber@example.com',
      subscriberName: 'Sam',
      peopleGroupName: 'Persians',
      peopleGroupSlug: 'persians',
      trackingId: 'track-1',
      profileId: 'profile-1',
      subscriptionId: 1,
      prayerDuration: 5,
      prayerContent: null,
    })
    expect(ok).toBe(true)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.headers).toMatchObject({
      'Auto-Submitted': 'auto-generated',
      'X-Auto-Response-Suppress': 'All',
    })
  })
})
