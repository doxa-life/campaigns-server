import countries from 'i18n-iso-countries'
import countriesEn from 'i18n-iso-countries/langs/en.json'
import { imbPeopleGroupService } from '../../database/imb-people-groups'
import { searchJoshuaProject } from '../../utils/app/joshua-project'
import { getSql } from '../../database/db'

countries.registerLocale(countriesEn)

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
      ? sql`SELECT metadata->>'imb_peid' as peid FROM people_groups WHERE metadata->>'imb_peid' IN ${sql(peids)}`
      : Promise.resolve([] as { peid: string }[]),
    jpIds.length
      ? sql`SELECT joshua_project_id FROM people_groups WHERE joshua_project_id IN ${sql(jpIds)}`
      : Promise.resolve([] as { joshua_project_id: string }[])
  ])
  const knownPeids = new Set(doxaByPeid.map((r: any) => r.peid))
  const knownJpIds = new Set(doxaByJpId.map((r: any) => r.joshua_project_id))

  const results = [
    ...imbResults.map((r) => ({
      source: 'imb',
      external_id: r.peid,
      name: r.name,
      country: r.country,
      in_doxa: knownPeids.has(r.peid),
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
        engagement_status: r.engagement_status
      },
      identifiers: { imb_peid: r.peid, imb_pgid: r.pgid }
    })),
    ...jpResults.map((r) => ({
      source: 'jp',
      external_id: r.jp_people_id,
      name: r.name,
      country: r.country,
      in_doxa: knownJpIds.has(r.jp_people_id),
      prefill: {
        name: r.name,
        population: r.population,
        // JP's ROG3 codes are not ISO alpha-3; resolve from the country name.
        country_code: r.country ? countries.getAlpha3Code(r.country, 'en') ?? null : null,
        latitude: r.latitude,
        longitude: r.longitude,
        // JP religion is a display label, not an IMB ROR code — shown to the
        // submitter but not prefilled into the religion select.
        primary_language: r.language_code
      },
      religion_label: r.religion,
      language_label: r.language_name,
      identifiers: { joshua_project_id: r.jp_people_id }
    }))
  ]

  return { results }
})
