import type { FieldDefinition } from '../types'

export const field: FieldDefinition = {
  key: 'region',
  labelKey: 'peopleGroups.fields.region',
  type: 'select',
  category: 'geography',
  tableColumn: true,
  options: [
    { value: 'africa', labelKey: 'peopleGroups.options.regions.africa' },
    { value: 'americas', labelKey: 'peopleGroups.options.regions.americas' },
    { value: 'asia', labelKey: 'peopleGroups.options.regions.asia' },
    { value: 'europe', labelKey: 'peopleGroups.options.regions.europe' },
    { value: 'oceania', labelKey: 'peopleGroups.options.regions.oceania' }
  ]
}
