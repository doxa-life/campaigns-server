import { getSql } from './db'

export interface ImbPeopleGroup {
  peid: string
  pgid: string | null
  name: string
  country: string | null
  country_code: string | null
  region: string | null
  subregion: string | null
  population: number | null
  latitude: number | null
  longitude: number | null
  primary_religion: string | null
  primary_language: string | null
  engagement_status: string | null
  gsec: number | null
  is_diaspora: boolean
  photo_url: string | null
  raw: Record<string, string>
  synced_at: string
}

export type UpsertImbPeopleGroup = Omit<ImbPeopleGroup, 'synced_at'>

const UPSERT_CHUNK_SIZE = 500

class ImbPeopleGroupService {
  private sql = getSql()

  /**
   * Upsert a full CSV snapshot, then delete rows absent from it. `syncedAt`
   * stamps every touched row so leftovers from earlier syncs can be removed.
   */
  async replaceAll(rows: UpsertImbPeopleGroup[], syncedAt: Date): Promise<{ upserted: number; removed: number }> {
    let upserted = 0
    for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
      // raw stays an object — the driver JSON-serializes it once for the jsonb
      // column (pre-stringifying would double-encode it into a string scalar).
      const chunk = rows.slice(i, i + UPSERT_CHUNK_SIZE).map((row) => ({
        ...row,
        synced_at: syncedAt
      }))
      await this.sql`
        INSERT INTO imb_people_groups ${this.sql(
          chunk,
          'peid', 'pgid', 'name', 'country', 'country_code', 'region', 'subregion',
          'population', 'latitude', 'longitude', 'primary_religion', 'primary_language',
          'engagement_status', 'gsec', 'is_diaspora', 'photo_url', 'raw', 'synced_at'
        )}
        ON CONFLICT (peid) DO UPDATE SET
          pgid = EXCLUDED.pgid,
          name = EXCLUDED.name,
          country = EXCLUDED.country,
          country_code = EXCLUDED.country_code,
          region = EXCLUDED.region,
          subregion = EXCLUDED.subregion,
          population = EXCLUDED.population,
          latitude = EXCLUDED.latitude,
          longitude = EXCLUDED.longitude,
          primary_religion = EXCLUDED.primary_religion,
          primary_language = EXCLUDED.primary_language,
          engagement_status = EXCLUDED.engagement_status,
          gsec = EXCLUDED.gsec,
          is_diaspora = EXCLUDED.is_diaspora,
          photo_url = EXCLUDED.photo_url,
          raw = EXCLUDED.raw,
          synced_at = EXCLUDED.synced_at
      `
      upserted += chunk.length
    }

    const deleted = await this.sql`DELETE FROM imb_people_groups WHERE synced_at < ${syncedAt}`
    return { upserted, removed: deleted.count }
  }

  async search(query: string, limit = 20): Promise<ImbPeopleGroup[]> {
    const like = `%${query}%`
    return await this.sql<ImbPeopleGroup[]>`
      SELECT * FROM imb_people_groups
      WHERE name ILIKE ${like} OR country ILIKE ${like} OR peid ILIKE ${like}
      ORDER BY name ASC
      LIMIT ${limit}
    `
  }
}

export const imbPeopleGroupService = new ImbPeopleGroupService()
