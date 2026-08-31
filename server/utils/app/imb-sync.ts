import { imbPeopleGroupService, type UpsertImbPeopleGroup } from '../../database/imb-people-groups'

export const IMB_CSV_URL = 'https://peoplegroups.org/wp-content/uploads/people_groups.csv'

/**
 * RFC 4180 CSV parser. The IMB export has quoted fields containing commas and
 * newlines (e.g. PeopleDesc), so naive line splitting is not enough.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else {
      field += char
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    if (row.length > 1 || row[0] !== '') rows.push(row)
  }

  const header = rows.shift()
  if (!header) return []
  return rows.map((r) => {
    const obj: Record<string, string> = {}
    header.forEach((col, idx) => {
      const value = (r[idx] ?? '').trim()
      // Skip empties to keep the stored raw jsonb small.
      if (value !== '') obj[col.trim()] = value
    })
    return obj
  })
}

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
  return {
    peid,
    pgid: row['PGID'] ?? null,
    name,
    country: row['CountryDisplayName'] || row['CountryName'] || row['Ctry'] || null,
    country_code: row['ISOAlpha3'] || row['ISOalpha3'] || null,
    region: row['UNm49RegionName'] || row['Regn'] || null,
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
