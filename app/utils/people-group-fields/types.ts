export type FieldType = 'text' | 'number' | 'textarea' | 'select' | 'boolean' | 'translatable' | 'picture-credit'

export interface FieldOption {
  value: string
  label?: string      // Direct label (for proper nouns that don't need translation)
  labelKey?: string   // Translation key (for translatable options)
  alternateKeys?: string[]  // Translation keys for alternate search terms (e.g., "Muslim" for "Islam - Sunni")
}

export interface FieldDefinition {
  key: string
  labelKey: string
  type: FieldType
  category: string
  options?: FieldOption[]
  optionsSource?: 'countries'
  tableColumn?: boolean
  readOnly?: boolean
  description?: string
  showIf?: { field: string; value: string }
}

export interface FieldCategory {
  key: string
  labelKey: string
  order: number
}

export const categories: FieldCategory[] = [
  { key: 'status', labelKey: 'peopleGroups.categories.status', order: 0 },
  { key: 'engagement', labelKey: 'peopleGroups.categories.engagement', order: 1 },
  { key: 'basic', labelKey: 'peopleGroups.categories.basic', order: 2 },
  { key: 'identifiers', labelKey: 'peopleGroups.categories.identifiers', order: 3 },
  { key: 'geography', labelKey: 'peopleGroups.categories.geography', order: 4 },
  { key: 'population', labelKey: 'peopleGroups.categories.population', order: 5 },
  { key: 'strategic', labelKey: 'peopleGroups.categories.strategic', order: 6 },
  { key: 'language', labelKey: 'peopleGroups.categories.language', order: 7 },
  { key: 'religion', labelKey: 'peopleGroups.categories.religion', order: 8 },
  { key: 'rop', labelKey: 'peopleGroups.categories.rop', order: 9 },
  { key: 'workers', labelKey: 'peopleGroups.categories.workers', order: 10 },
  { key: 'resources', labelKey: 'peopleGroups.categories.resources', order: 11 },
  { key: 'wagf', labelKey: 'peopleGroups.categories.wagf', order: 12 },
  { key: 'media', labelKey: 'peopleGroups.categories.media', order: 13 }
]
