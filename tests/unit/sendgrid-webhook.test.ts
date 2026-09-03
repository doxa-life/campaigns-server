import { describe, it, expect } from 'vitest'
import { generateKeyPairSync, createSign } from 'crypto'
import { verifySendgridSignature } from '../../server/utils/sendgrid-webhook'

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const publicKeyB64 = publicKey.export({ format: 'der', type: 'spki' }).toString('base64')

const payload = JSON.stringify([{ event: 'delivered', email: 'a@example.com' }])

function sign(timestamp: string, body: string = payload): string {
  return createSign('SHA256').update(timestamp + body, 'utf8').sign(privateKey, 'base64')
}

describe('verifySendgridSignature', () => {
  it('accepts a valid signature with a Unix-seconds timestamp (SendGrid format)', () => {
    const timestamp = String(Math.floor(Date.now() / 1000))
    const res = verifySendgridSignature({ publicKeyB64, payload, signature: sign(timestamp), timestamp })
    expect(res.ok).toBe(true)
  })

  it('accepts a valid signature with an ISO timestamp', () => {
    const timestamp = new Date().toISOString()
    const res = verifySendgridSignature({ publicKeyB64, payload, signature: sign(timestamp), timestamp })
    expect(res.ok).toBe(true)
  })

  it('rejects a stale Unix-seconds timestamp even with a valid signature', () => {
    const timestamp = String(Math.floor(Date.now() / 1000) - 3600)
    const res = verifySendgridSignature({ publicKeyB64, payload, signature: sign(timestamp), timestamp })
    expect(res.ok).toBe(false)
    expect(res.reason).toBe('Stale signature')
  })

  it('rejects an unparseable timestamp', () => {
    const timestamp = 'not-a-time'
    const res = verifySendgridSignature({ publicKeyB64, payload, signature: sign(timestamp), timestamp })
    expect(res.ok).toBe(false)
    expect(res.reason).toBe('Stale signature')
  })

  it('rejects a tampered payload', () => {
    const timestamp = String(Math.floor(Date.now() / 1000))
    const res = verifySendgridSignature({ publicKeyB64, payload: payload + 'x', signature: sign(timestamp), timestamp })
    expect(res.ok).toBe(false)
    expect(res.reason).toBe('Invalid signature')
  })

  it('rejects when no verification key is configured', () => {
    const timestamp = String(Math.floor(Date.now() / 1000))
    const res = verifySendgridSignature({ publicKeyB64: '', payload, signature: sign(timestamp), timestamp })
    expect(res.ok).toBe(false)
    expect(res.reason).toBe('Verification key not configured')
  })
})
