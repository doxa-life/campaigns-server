import countries from 'i18n-iso-countries'
import countriesEn from 'i18n-iso-countries/langs/en.json'
import { imbPeopleGroupService, type ImbPeopleGroup } from '../../database/imb-people-groups'
import { searchJoshuaProject } from '../../utils/app/joshua-project'
import { getSql } from '../../database/db'

countries.registerLocale(countriesEn)

// IMB serves these URL variants when a group has no real photo.
const IMB_NO_PHOTO_MARKERS = ['NoImageAvailable', 'no_photo', 'nophoto', 'no-photo']

function realPhotoUrl(url: string | null): string | null {
  if (!url) return null
  return IMB_NO_PHOTO_MARKERS.some((marker) => url.includes(marker)) ? null : url
}

// IMB ROR codes counted as a Christian background by the DOXA filter.
const CHRISTIAN_ROR_CODES = new Set(['C', 'CPR', 'CPC', 'CRO', 'CEV', 'CAO', 'CAN', 'CCM', 'CFC', 'CRC', 'COR', 'CNP'])

// Which DOXA filter rules an IMB group fails — i.e. why it isn't on the DOXA
// list. Empty = the group matches the filter and simply hasn't been imported.
function doxaExclusionReasons(row: ImbPeopleGroup): string[] {
  const reasons: string[] = []
  if (row.engagement_status && row.engagement_status !== 'unengaged') reasons.push('engaged')
  if (row.gsec !== null && row.gsec > 2) reasons.push('gsec_above_2')
  if (row.primary_religion && CHRISTIAN_ROR_CODES.has(row.primary_religion)) reasons.push('christian_religion')
  if (row.is_diaspora) reasons.push('diaspora')
  return reasons
}

/**
 * GET /api/updates/search-external?q=
 * Public search over the IMB mirror and the Joshua Project dataset for the
 * /updates add-flow picker. Results carry prefill values keyed by Doxa field
 * keys, plus in_doxa so submitters see when a group already exists here.
 */
export default defineEventHandler(async (event) => {
  const q = String(getQuery(event).q || '').trim()
  if (q.length < 2) return { results: [] }

  const [imbResults, jpResults] = await Promise.all([
    imbPeopleGroupService.search(q, 15),
    searchJoshuaProject(q, 15)
  ])

  const sql = getSql()
  const peids = imbResults.map((r) => r.peid)
  const jpIds = [...new Set(jpResults.map((r) => r.jp_people_id))]
  const [doxaByPeid, doxaByJpId] = await Promise.all([
    peids.length
      ? sql`SELECT id, metadata->>'imb_peid' as peid FROM people_groups WHERE metadata->>'imb_peid' IN ${sql(peids)}`
      : Promise.resolve([] as { id: number; peid: string }[]),
    jpIds.length
      ? sql`SELECT id, joshua_project_id FROM people_groups WHERE joshua_project_id IN ${sql(jpIds)}`
      : Promise.resolve([] as { id: number; joshua_project_id: string }[])
  ])
  const knownPeids = new Map(doxaByPeid.map((r: any) => [r.peid, r.id as number]))
  const knownJpIds = new Map(doxaByJpId.map((r: any) => [r.joshua_project_id, r.id as number]))

  const results = [
    ...imbResults.map((r) => ({
      source: 'imb',
      external_id: r.peid,
      name: r.name,
      country: r.country,
      in_doxa: knownPeids.has(r.peid),
      // Set when the group is already on the Doxa list, so the picker can
      // route the selection into the update/remove flow for that group.
      doxa_id: knownPeids.get(r.peid) ?? null,
      doxa_exclusion_reasons: doxaExclusionReasons(r),
      // Values keyed by Doxa field keys, ready to prefill the add form.
      prefill: {
        name: r.name,
        // BIGINT columns arrive as strings from the driver.
        population: r.population === null ? null : Number(r.population),
        country_code: r.country_code,
        latitude: r.latitude,
        longitude: r.longitude,
        primary_religion: r.primary_religion,
        primary_language: r.primary_language,
        engagement_status: r.engagement_status,
        image_url: realPhotoUrl(r.photo_url)
      },
      identifiers: { imb_peid: r.peid, imb_pgid: r.pgid }
    })),
    ...jpResults.map((r) => ({
      source: 'jp',
      external_id: r.jp_people_id,
      name: r.name,
      country: r.country,
      in_doxa: knownJpIds.has(r.jp_people_id),
      doxa_id: knownJpIds.get(r.jp_people_id) ?? null,
      prefill: {
        name: r.name,
        population: r.population,
        // JP's ROG3 codes are not ISO alpha-3; resolve from the country name.
        country_code: r.country ? countries.getAlpha3Code(r.country, 'en') ?? null : null,
        latitude: r.latitude,
        longitude: r.longitude,
        // JP religion is a display label, not an IMB ROR code — shown to the
        // submitter but not prefilled into the religion select.
        primary_language: r.language_code,
        image_url: r.photo_url
      },
      religion_label: r.religion,
      language_label: r.language_name,
      identifiers: { joshua_project_id: r.jp_people_id }
    }))
  ]

  return { results }
})
