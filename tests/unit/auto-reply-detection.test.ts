import { describe, it, expect } from 'vitest'
import { isVacationAutoReply, type InboundHeaders } from '../../server/utils/mailgun-inbound'

function headers(pairs: Record<string, string>): InboundHeaders {
  const map = new Map(Object.entries(pairs).map(([k, v]) => [k.toLowerCase(), v]))
  return {
    get: name => map.get(name.toLowerCase()) ?? null,
    getAll: name => {
      const v = map.get(name.toLowerCase())
      return v === undefined ? [] : [v]
    },
  }
}

const human = 'pastor@example.com'

describe('isVacationAutoReply', () => {
  it('matches an RFC 3834 auto-replied vacation message', () => {
    expect(isVacationAutoReply(headers({ 'Auto-Submitted': 'auto-replied' }), human)).toBe(true)
  })

  it('matches an Exchange out-of-office reply (auto-generated from a human mailbox)', () => {
    const h = headers({
      'Auto-Submitted': 'auto-generated',
      'X-Auto-Response-Suppress': 'All',
      'Content-Type': 'multipart/alternative; boundary="b1"',
    })
    expect(isVacationAutoReply(h, human)).toBe(true)
  })

  it('does not match a delivery status report', () => {
    const h = headers({
      'Auto-Submitted': 'auto-generated',
      'Content-Type': 'multipart/report; report-type=delivery-status; boundary="b1"',
    })
    expect(isVacationAutoReply(h, human)).toBe(false)
  })

  it('does not match a system sender', () => {
    const h = headers({ 'Auto-Submitted': 'auto-generated' })
    expect(isVacationAutoReply(h, 'postmaster@example.com')).toBe(false)
    expect(isVacationAutoReply(h, 'mailer-daemon@example.com')).toBe(false)
  })

  it('does not match ordinary mail', () => {
    expect(isVacationAutoReply(headers({ 'Content-Type': 'text/plain' }), human)).toBe(false)
    expect(isVacationAutoReply(headers({ 'Auto-Submitted': 'no' }), human)).toBe(false)
  })
})
