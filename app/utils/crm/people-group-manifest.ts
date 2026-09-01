import type { Ref } from 'vue'
import { getField } from '~/utils/people-group-fields'
import type { ClientManifest } from './filter-manifest'

// Resolves derived filter keys that aren't plain columns on the record.
export function getPeopleGroupFilterValue(group: Record<string, any>, key: string): unknown {
  if (key === 'adopted') return (Number(group.adoption_count) || 0) > 0
  if (key === 'prayer_commitments') return (Number(group.people_committed) || 0) > 0
  return group[key]
}

export function usePeopleGroupFilterManifest(peopleGroups: Ref<Record<string, any>[]>) {
  const { t, te } = useI18n()
  const { getCountryName } = useLocalizedOptions()

  function fieldEnumValues(key: string): { label: string; value: unknown }[] {
    return (getField(key)?.options || []).map(opt => ({
      label: opt.label || (opt.labelKey ? t(opt.labelKey) : opt.value),
      value: opt.value,
    }))
  }

  // Country, language, and tag options come from the values present in the
  // loaded list, so the dropdowns only offer choices that can match something.
  const countryValues = computed(() => {
    const codes = new Set<string>()
    for (const g of peopleGroups.value) if (g.country_code) codes.add(g.country_code)
    return [...codes]
      .map(code => ({ label: getCountryName(code), value: code as unknown }))
      .sort((a, b) => a.label.localeCompare(b.label))
  })

  const languageValues = computed(() => {
    const codes = new Set<string>()
    for (const g of peopleGroups.value) if (g.primary_language) codes.add(g.primary_language)
    return [...codes]
      .map(code => ({
        label: te(`languages.${code}`) ? t(`languages.${code}`) : code,
        value: code as unknown,
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  })

  const tagValues = computed(() => {
    const tags = new Set<string>()
    for (const g of peopleGroups.value) {
      if (Array.isArray(g.tags)) for (const tag of g.tags) tags.add(tag)
    }
    return [...tags].sort().map(tag => ({ label: tag, value: tag as unknown }))
  })

  const manifest = computed<ClientManifest>(() => [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'status', label: 'Status', type: 'enum', values: fieldEnumValues('status') },
    { key: 'engagement_status', label: 'Engagement', type: 'enum', values: fieldEnumValues('engagement_status') },
    { key: 'adopted', label: 'Adopted', type: 'boolean' },
    { key: 'prayer_commitments', label: 'Prayer Commitments', type: 'boolean' },
    { key: 'country_code', label: 'Country', type: 'enum', values: countryValues.value },
    { key: 'region', label: 'Region', type: 'enum', values: fieldEnumValues('region') },
    { key: 'primary_religion', label: 'Religion', type: 'enum', values: fieldEnumValues('primary_religion') },
    { key: 'primary_language', label: 'Language', type: 'enum', values: languageValues.value },
    { key: 'population', label: 'Population', type: 'number' },
    { key: 'evangelical_pct', label: 'Evangelical %', type: 'number' },
    { key: 'tags', label: 'Tags', type: 'enum-multi', values: tagValues.value },
    { key: 'created_at', label: 'Created', type: 'date' },
  ])

  return manifest
}
