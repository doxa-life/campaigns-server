import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { getPeopleGroupFilterValue, usePeopleGroupFilterManifest } from '~/utils/crm/people-group-manifest'

vi.stubGlobal('useI18n', () => ({ t: (key: string) => key, te: () => false }))
vi.stubGlobal('useLocalizedOptions', () => ({ getCountryName: (code: string) => `Country ${code}` }))

describe('getPeopleGroupFilterValue', () => {
  it('reads table columns from the record and other registry fields from metadata', () => {
    const group = { region: 'asia', metadata: { doxa_wagf_region: 'middle_east', imb_gsec: '1' } }
    expect(getPeopleGroupFilterValue(group, 'region')).toBe('asia')
    expect(getPeopleGroupFilterValue(group, 'doxa_wagf_region')).toBe('middle_east')
    expect(getPeopleGroupFilterValue(group, 'imb_gsec')).toBe('1')
    expect(getPeopleGroupFilterValue({ metadata: {} }, 'doxa_wagf_region')).toBeUndefined()
  })

  it('normalizes boolean flags stored as true or "1"', () => {
    expect(getPeopleGroupFilterValue({ metadata: { imb_has_photo: '1' } }, 'imb_has_photo')).toBe(true)
    expect(getPeopleGroupFilterValue({ metadata: { imb_has_photo: true } }, 'imb_has_photo')).toBe(true)
    expect(getPeopleGroupFilterValue({ metadata: { imb_has_photo: '' } }, 'imb_has_photo')).toBe(false)
    expect(getPeopleGroupFilterValue({ metadata: {} }, 'imb_bible_available')).toBe(false)
  })

  it('derives adopted and prayer commitments from counts and passes other keys through', () => {
    expect(getPeopleGroupFilterValue({ adoption_count: 2 }, 'adopted')).toBe(true)
    expect(getPeopleGroupFilterValue({ people_committed: 0 }, 'prayer_commitments')).toBe(false)
    expect(getPeopleGroupFilterValue({ tags: ['x'] }, 'tags')).toEqual(['x'])
  })
})

describe('usePeopleGroupFilterManifest', () => {
  const groups = ref([
    { country_code: 'NPL', primary_language: 'nep', tags: ['a'] },
    { country_code: 'IND', primary_language: 'hin', tags: ['b', 'a'] },
  ])
  const manifest = usePeopleGroupFilterManifest(groups).value
  const byKey = Object.fromEntries(manifest.map(f => [f.key, f]))

  it('includes every filterable registry field with its options and label key', () => {
    expect(byKey.doxa_wagf_region?.type).toBe('enum')
    expect(byKey.doxa_wagf_region?.values?.map(v => v.value)).toContain('middle_east')
    expect(byKey.doxa_wagf_region?.label).toBe('peopleGroups.fields.doxa_wagf_region')
    expect(byKey.imb_bible_available?.type).toBe('boolean')
    expect(byKey.imb_language_speakers?.type).toBe('number')
    expect(byKey.imb_peid?.type).toBe('text')
  })

  it('leaves out hidden and non-filterable fields', () => {
    expect(byKey.imb_display_name).toBeUndefined()
    expect(byKey.imb_people_description).toBeUndefined()
    expect(byKey.descriptions).toBeUndefined()
    expect(byKey.picture_credit).toBeUndefined()
  })

  it('draws country, language, and tag options from the loaded list', () => {
    expect(byKey.country_code?.values?.map(v => v.value).sort()).toEqual(['IND', 'NPL'])
    expect(byKey.primary_language?.values?.map(v => v.value).sort()).toEqual(['hin', 'nep'])
    expect(byKey.tags?.values?.map(v => v.value)).toEqual(['a', 'b'])
  })

  it('keeps the derived fields', () => {
    expect(byKey.adopted?.type).toBe('boolean')
    expect(byKey.prayer_commitments?.type).toBe('boolean')
    expect(byKey.created_at?.type).toBe('date')
  })
})
