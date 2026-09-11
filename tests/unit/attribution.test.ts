import { beforeEach, describe, expect, it } from 'vitest'
import { captureAttribution, getAttribution, readUtmParams, signupAttribution } from '~/utils/attribution'

const HOST = 'pray.doxa.life'
const DAY_MS = 24 * 60 * 60 * 1000

describe('attribution', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('reads utm parameters from a query string, ignoring blanks', () => {
    expect(readUtmParams('?utm_source=doxa.life&utm_campaign=%20&utm_term=&x=1')).toEqual({
      utm_source: 'doxa.life'
    })
  })

  it('captures a utm-tagged landing together with its external referrer', () => {
    captureAttribution(
      { search: '?utm_source=doxa.life&utm_medium=website', referrer: 'https://doxa.life/pg/', hostname: HOST },
      1000
    )
    expect(getAttribution(1000)).toEqual({
      utm_source: 'doxa.life',
      utm_medium: 'website',
      referrer: 'https://doxa.life/pg/',
      captured_at: new Date(1000).toISOString()
    })
  })

  it('captures an untagged visit from an external site by its referrer', () => {
    captureAttribution({ search: '', referrer: 'https://example.org/post', hostname: HOST }, 1000)
    expect(getAttribution(1000)?.referrer).toBe('https://example.org/post')
    expect(getAttribution(1000)?.utm_source).toBeUndefined()
  })

  it('keeps the earlier touch on direct visits and same-site navigation', () => {
    captureAttribution({ search: '?utm_source=newsletter', referrer: '', hostname: HOST }, 1000)
    captureAttribution({ search: '', referrer: '', hostname: HOST }, 2000)
    captureAttribution({ search: '', referrer: `https://${HOST}/verify`, hostname: HOST }, 3000)
    expect(getAttribution(3000)?.utm_source).toBe('newsletter')
  })

  it('lets a later tagged visit replace the earlier touch', () => {
    captureAttribution({ search: '?utm_source=newsletter', referrer: '', hostname: HOST }, 1000)
    captureAttribution({ search: '?utm_source=doxa.life', referrer: '', hostname: HOST }, 2000)
    expect(getAttribution(2000)?.utm_source).toBe('doxa.life')
  })

  it('forgets a touch older than 90 days', () => {
    captureAttribution({ search: '?utm_source=doxa.life', referrer: '', hostname: HOST }, 0)
    expect(getAttribution(89 * DAY_MS)).not.toBeNull()
    expect(getAttribution(91 * DAY_MS)).toBeNull()
  })

  it('exposes only the fields a signup request carries', () => {
    captureAttribution(
      { search: '?utm_source=doxa.life&utm_campaign=push&utm_term=ignored', referrer: 'https://doxa.life/', hostname: HOST },
      1000
    )
    expect(signupAttribution(1000)).toEqual({
      utm_source: 'doxa.life',
      utm_campaign: 'push',
      referrer: 'https://doxa.life/'
    })
    localStorage.clear()
    expect(signupAttribution(1000)).toEqual({})
  })
})
