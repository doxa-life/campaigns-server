import type { FieldDefinition } from '../types'

export const field: FieldDefinition = {
  key: 'imb_church_planting',
  labelKey: 'peopleGroups.fields.imb_church_planting',
  type: 'select',
  category: 'strategic',
  options: [
    { value: '0', labelKey: 'peopleGroups.options.churchPlanting.0' },
    { value: '1', labelKey: 'peopleGroups.options.churchPlanting.1' },
    { value: '2', labelKey: 'peopleGroups.options.churchPlanting.2' }
  ]
}
