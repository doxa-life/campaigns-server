import type { FieldDefinition } from '../types'

export const field: FieldDefinition = {
  key: 'status',
  labelKey: 'peopleGroups.fields.status',
  type: 'select',
  category: 'status',
  tableColumn: true,
  options: [
    { value: 'active', labelKey: 'peopleGroups.options.status.active' },
    { value: 'archived', labelKey: 'peopleGroups.options.status.archived' }
  ]
}
