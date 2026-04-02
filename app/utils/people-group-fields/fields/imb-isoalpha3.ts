import type { FieldDefinition } from '../types'

export const field: FieldDefinition = {
  key: 'country_code',
  labelKey: 'peopleGroups.fields.country_code',
  type: 'select',
  category: 'geography',
  optionsSource: 'countries',
  tableColumn: true
}
