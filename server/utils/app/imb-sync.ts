import { imbPeopleGroupService, type UpsertImbPeopleGroup } from '../../database/imb-people-groups'
// The IMB export has quoted fields containing commas and newlines (e.g.
// PeopleDesc), so naive line splitting is not enough.
import { parseCsv } from '#shared/csv'

export const IMB_CSV_URL = 'https://peoplegroups.org/wp-content/uploads/people_groups.csv'

function parseIntOrNull(v: string | undefined): number | null {
  if (!v) return null
  const n = parseInt(v.replace(/,/g, ''), 10)
  return Number.isFinite(n) ? n : null
}

function parseFloatOrNull(v: string | undefined): number | null {
  if (!v) return null
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : null
}

// Column names follow the current peoplegroups.org export (DisplayName,
// CountryName, Lat/Long, ReligionCode, EngagementStatus, ...); the older
// export's names (NmDisp, Ctry, Latitude, ROR, EngStat, ...) are kept as
// fallbacks since IMB has changed the format before.
export function mapCsvRow(row: Record<string, string>): UpsertImbPeopleGroup | null {
  const peid = row['PEID']
  const name = row['DisplayName'] || row['NmDisp'] || row['Name']
  if (!peid || !name) return null
  const engagement = row['EngagementStatus'] || row['EngStat']
  // IMB capitalizes region names; the region field's option keys are lowercase.
  const region = row['UNm49RegionName'] || row['Regn']
  return {
    peid,
    pgid: row['PGID'] ?? null,
    name,
    country: row['CountryDisplayName'] || row['CountryName'] || row['Ctry'] || null,
    country_code: row['ISOAlpha3'] || row['ISOalpha3'] || null,
    region: region ? region.toLowerCase() : null,
    subregion: row['UNm49SubRegionName'] || row['RegnSub'] || null,
    population: parseIntOrNull(row['Population'] || row['Pop']),
    latitude: parseFloatOrNull(row['Lat'] || row['Latitude']),
    longitude: parseFloatOrNull(row['Long'] || row['Longitude']),
    primary_religion: row['ReligionCode'] || row['ROR'] || null,
    primary_language: row['LanguageCode'] || row['ROL'] || null,
    engagement_status: engagement ? engagement.toLowerCase() : null,
    gsec: parseIntOrNull(row['GSEC']),
    is_diaspora: row['Indigenous'] === 'Diaspora',
    photo_url: row['PhotoURL'] || row['PicURL'] || null,
    raw: row
  }
}

export async function syncImbPeopleGroups(csvText?: string): Promise<{ upserted: number; removed: number; total: number }> {
  let text = csvText
  if (!text) {
    const response = await fetch(IMB_CSV_URL)
    if (!response.ok) {
      throw new Error(`IMB CSV download failed: ${response.status} ${response.statusText}`)
    }
    text = await response.text()
  }

  const rows = parseCsv(text)
  // Dedupe by PEID (last row wins) — a duplicate inside one bulk-insert chunk
  // would make ON CONFLICT DO UPDATE fail.
  const byPeid = new Map<string, UpsertImbPeopleGroup>()
  for (const row of rows) {
    const mapped = mapCsvRow(row)
    if (mapped) byPeid.set(mapped.peid, mapped)
  }
  const mapped = [...byPeid.values()]
  if (mapped.length === 0) {
    throw new Error('IMB CSV parsed to zero rows — refusing to wipe the mirror')
  }

  const syncedAt = new Date()
  const { upserted, removed } = await imbPeopleGroupService.replaceAll(mapped, syncedAt)
  return { upserted, removed, total: mapped.length }
}
