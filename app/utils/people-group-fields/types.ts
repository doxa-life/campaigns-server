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
}

export interface FieldCategory {
  key: string
  labelKey: string
  order: number
}

export const categories: FieldCategory[] = [
  { key: 'engagement', labelKey: 'peopleGroups.categories.engagement', order: 0 },
  { key: 'basic', labelKey: 'peopleGroups.categories.basic', order: 1 },
  { key: 'identifiers', labelKey: 'peopleGroups.categories.identifiers', order: 2 },
  { key: 'geography', labelKey: 'peopleGroups.categories.geography', order: 3 },
  { key: 'population', labelKey: 'peopleGroups.categories.population', order: 4 },
  { key: 'strategic', labelKey: 'peopleGroups.categories.strategic', order: 5 },
  { key: 'language', labelKey: 'peopleGroups.categories.language', order: 6 },
  { key: 'religion', labelKey: 'peopleGroups.categories.religion', order: 7 },
  { key: 'rop', labelKey: 'peopleGroups.categories.rop', order: 8 },
  { key: 'workers', labelKey: 'peopleGroups.categories.workers', order: 9 },
  { key: 'resources', labelKey: 'peopleGroups.categories.resources', order: 10 },
  { key: 'wagf', labelKey: 'peopleGroups.categories.wagf', order: 11 },
  { key: 'media', labelKey: 'peopleGroups.categories.media', order: 12 }
]
