import type { Fragment } from 'postgres'
import { getSql } from './db'
import { buildSet } from './sql-helpers'
import type { ChurchLocationStatus, ChurchRecord } from '#shared/churches'

export type Church = ChurchRecord

export interface ChurchData {
  name: string
  town?: string | null
  country?: string | null
  pastor_name?: string | null
  pastor_phone?: string | null
  pastor_email?: string | null
  congregation_size?: number | null
  service_language?: string | null
  latitude?: number | null
  longitude?: number | null
  location_status?: ChurchLocationStatus | null
}

export type UpdateChurchData = Partial<ChurchData>

export interface ChurchLocation {
  latitude: number | null
  longitude: number | null
  location_status: ChurchLocationStatus | null
}

class ChurchService {
  private sql = getSql()

  async create(data: ChurchData): Promise<Church> {
    const [row] = await this.sql`
      INSERT INTO churches (
        name, town, country, pastor_name, pastor_phone, pastor_email,
        congregation_size, service_language, latitude, longitude, location_status
      ) VALUES (
        ${data.name}, ${data.town ?? null}, ${data.country ?? null},
        ${data.pastor_name ?? null}, ${data.pastor_phone ?? null}, ${data.pastor_email ?? null},
        ${data.congregation_size ?? null}, ${data.service_language ?? null},
        ${data.latitude ?? null}, ${data.longitude ?? null}, ${data.location_status ?? null}
      )
      RETURNING *
    `
    return row as Church
  }

  async createMany(rows: ChurchData[]): Promise<Church[]> {
    if (rows.length === 0) return []
    const values = rows.map(data => ({
      name: data.name,
      town: data.town ?? null,
      country: data.country ?? null,
      pastor_name: data.pastor_name ?? null,
      pastor_phone: data.pastor_phone ?? null,
      pastor_email: data.pastor_email ?? null,
      congregation_size: data.congregation_size ?? null,
      service_language: data.service_language ?? null,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      location_status: data.location_status ?? null
    }))
    return await this.sql`INSERT INTO churches ${this.sql(values)} RETURNING *` as unknown as Church[]
  }

  async getById(id: number): Promise<Church | null> {
    const [row] = await this.sql`SELECT * FROM churches WHERE id = ${id}`
    return (row as Church) || null
  }

  async getAll(options?: { search?: string }): Promise<Church[]> {
    const search = options?.search ? `%${options.search}%` : null
    const where = search
      ? this.sql`WHERE name ILIKE ${search} OR town ILIKE ${search} OR pastor_name ILIKE ${search}`
      : this.sql``
    return await this.sql`SELECT * FROM churches ${where} ORDER BY name ASC, id ASC` as unknown as Church[]
  }

  async count(): Promise<number> {
    const [result] = await this.sql`SELECT COUNT(*) as count FROM churches`
    return Number(result?.count)
  }

  async update(id: number, data: UpdateChurchData): Promise<Church | null> {
    const church = await this.getById(id)
    if (!church) return null

    const fields: Fragment[] = []
    if (data.name !== undefined) fields.push(this.sql`name = ${data.name}`)
    if (data.town !== undefined) fields.push(this.sql`town = ${data.town}`)
    if (data.country !== undefined) fields.push(this.sql`country = ${data.country}`)
    if (data.pastor_name !== undefined) fields.push(this.sql`pastor_name = ${data.pastor_name}`)
    if (data.pastor_phone !== undefined) fields.push(this.sql`pastor_phone = ${data.pastor_phone}`)
    if (data.pastor_email !== undefined) fields.push(this.sql`pastor_email = ${data.pastor_email}`)
    if (data.congregation_size !== undefined) fields.push(this.sql`congregation_size = ${data.congregation_size}`)
    if (data.service_language !== undefined) fields.push(this.sql`service_language = ${data.service_language}`)
    if (data.latitude !== undefined) fields.push(this.sql`latitude = ${data.latitude}`)
    if (data.longitude !== undefined) fields.push(this.sql`longitude = ${data.longitude}`)
    if (data.location_status !== undefined) fields.push(this.sql`location_status = ${data.location_status}`)

    if (fields.length === 0) return church

    fields.push(this.sql`updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'`)
    await this.sql`UPDATE churches SET ${buildSet(this.sql, fields)} WHERE id = ${id}`
    return this.getById(id)
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.sql`DELETE FROM churches WHERE id = ${id}`
    return result.count > 0
  }

  /** Distinct languages already entered, for the service-language autocomplete. */
  async distinctServiceLanguages(): Promise<string[]> {
    const rows = await this.sql`
      SELECT DISTINCT service_language FROM churches
      WHERE service_language IS NOT NULL AND service_language <> ''
      ORDER BY service_language
    `
    return rows.map(r => r.service_language as string)
  }

  async hasPendingGeocode(): Promise<boolean> {
    const [row] = await this.sql`SELECT 1 AS found FROM churches WHERE location_status = 'pending' LIMIT 1`
    return !!row
  }

  /** Next church waiting for a lookup; the least-attempted first so one failing row cannot block the rest. */
  async nextPendingGeocode(): Promise<Church | null> {
    const [row] = await this.sql`
      SELECT * FROM churches
      WHERE location_status = 'pending'
      ORDER BY geocode_attempts ASC, id ASC
      LIMIT 1
    `
    return (row as Church) || null
  }

  /**
   * Records a lookup outcome. Only touches the row if it is still pending, so an
   * admin who dragged the pin while the lookup ran keeps their manual location.
   */
  async recordGeocodeResult(id: number, result: { latitude: number; longitude: number } | null): Promise<void> {
    if (result) {
      await this.sql`
        UPDATE churches
        SET latitude = ${result.latitude}, longitude = ${result.longitude},
            location_status = 'geocoded', geocode_attempts = geocode_attempts + 1,
            updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
        WHERE id = ${id} AND location_status = 'pending'
      `
    } else {
      await this.sql`
        UPDATE churches
        SET location_status = 'not_found', geocode_attempts = geocode_attempts + 1,
            updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
        WHERE id = ${id} AND location_status = 'pending'
      `
    }
  }

  /** Counts a lookup that could not complete (rate limit, outage) so the row moves to the back of the queue. */
  async recordGeocodeFailure(id: number): Promise<void> {
    await this.sql`
      UPDATE churches SET geocode_attempts = geocode_attempts + 1
      WHERE id = ${id} AND location_status = 'pending'
    `
  }
}

export const churchService = new ChurchService()
