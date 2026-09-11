import type { Ref } from 'vue'
import { allFields, getField, type FieldDefinition, type FieldType } from '~/utils/people-group-fields'
import type { ClientFieldDef, ClientManifest } from './filter-manifest'

// Registry field types that have a filter operator set. Textarea, translatable
// and picture-credit fields are not filterable.
const FILTER_TYPES: Partial<Record<FieldType, ClientFieldDef['type']>> = {
  text: 'text',
  number: 'number',
  select: 'enum',
  boolean: 'boolean',
}

// Boolean flags in metadata are stored as true/false or as '1'/'' strings.
function isFlagSet(value: unknown): boolean {
  return value === true || value === '1' || value === 'true'
}

// Resolves filter keys to record values: derived keys, registry fields stored
// in metadata, and everything else as a plain column on the record.
export function getPeopleGroupFilterValue(group: Record<string, any>, key: string): unknown {
  if (key === 'adopted') return (Number(group.adoption_count) || 0) > 0
  if (key === 'prayer_commitments') return (Number(group.people_committed) || 0) > 0
  const field = getField(key)
  const raw = field && !field.tableColumn ? group.metadata?.[key] : group[key]
  return field?.type === 'boolean' ? isFlagSet(raw) : raw
}

export function usePeopleGroupFilterManifest(peopleGroups: Ref<Record<string, any>[]>) {
  const { t, te } = useI18n()
  const { getCountryName } = useLocalizedOptions()

  function optionValues(field: FieldDefinition): { label: string; value: unknown }[] {
    return (field.options || []).map(opt => ({
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

  function enumValues(field: FieldDefinition): { label: string; value: unknown }[] {
    if (field.optionsSource === 'countries') return countryValues.value
    if (field.key === 'primary_language') return languageValues.value
    return optionValues(field)
  }

  const manifest = computed<ClientManifest>(() => {
    const registryFields = allFields.flatMap((field): ClientFieldDef[] => {
      const type = FILTER_TYPES[field.type]
      if (!type || field.hidden) return []
      const def: ClientFieldDef = { key: field.key, label: t(field.labelKey), type }
      if (type === 'enum') def.values = enumValues(field)
      return [def]
    })
    return [
      ...registryFields,
      { key: 'adopted', label: 'Adopted', type: 'boolean' },
      { key: 'prayer_commitments', label: 'Prayer Commitments', type: 'boolean' },
      { key: 'tags', label: 'Tags', type: 'enum-multi', values: tagValues.value },
      { key: 'created_at', label: 'Created', type: 'date' },
    ]
  })

  return manifest
}
