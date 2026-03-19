import { getSql } from './db'
import { randomBytes, createHash, timingSafeEqual } from 'crypto'

const KEY_PREFIX = 'dxk_'

export interface ApiKey {
  id: number
  user_id: string
  name: string
  key_prefix: string
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

export interface ApiKeyCandidate {
  id: number
  user_id: string
  key_hash: string
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

export class ApiKeyService {
  private sql = getSql()

  generateKey(): { key: string; keyPrefix: string; keyHash: string } {
    const raw = randomBytes(20).toString('hex')
    const key = `${KEY_PREFIX}${raw}`
    const keyPrefix = key.substring(0, 8)
    const keyHash = sha256(key)
    return { key, keyPrefix, keyHash }
  }

  async createApiKey(userId: string, name: string): Promise<{ apiKey: ApiKey; plaintextKey: string }> {
    const { key, keyPrefix, keyHash } = this.generateKey()

    const [apiKey] = await this.sql`
      INSERT INTO api_keys (user_id, name, key_hash, key_prefix)
      VALUES (${userId}, ${name}, ${keyHash}, ${keyPrefix})
      RETURNING id, user_id, name, key_prefix, created_at, last_used_at, revoked_at
    `

    return { apiKey: apiKey as ApiKey, plaintextKey: key }
  }

  async getUserApiKeys(userId: string): Promise<ApiKey[]> {
    return await this.sql`
      SELECT id, user_id, name, key_prefix, created_at, last_used_at, revoked_at
      FROM api_keys
      WHERE user_id = ${userId} AND revoked_at IS NULL
      ORDER BY created_at DESC
    `
  }

  async findActiveKeysByPrefix(prefix: string): Promise<ApiKeyCandidate[]> {
    return await this.sql`
      SELECT id, user_id, key_hash
      FROM api_keys
      WHERE key_prefix = ${prefix} AND revoked_at IS NULL
    `
  }

  verifyKey(rawKey: string, keyHash: string): boolean {
    const rawHash = Buffer.from(sha256(rawKey), 'hex')
    const storedHash = Buffer.from(keyHash, 'hex')
    if (rawHash.length !== storedHash.length) return false
    return timingSafeEqual(rawHash, storedHash)
  }

  async updateLastUsed(id: number): Promise<void> {
    await this.sql`
      UPDATE api_keys SET last_used_at = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
      WHERE id = ${id}
    `
  }

  async revokeApiKey(id: number, userId: string): Promise<boolean> {
    const result = await this.sql`
      UPDATE api_keys SET revoked_at = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
      WHERE id = ${id} AND user_id = ${userId} AND revoked_at IS NULL
    `
    return result.count > 0
  }
}

export const apiKeyService = new ApiKeyService()
