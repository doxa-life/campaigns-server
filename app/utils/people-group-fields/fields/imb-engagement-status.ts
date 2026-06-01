import type { FieldDefinition } from '../types'

export const field: FieldDefinition = {
  key: 'engagement_status',
  labelKey: 'peopleGroups.fields.engagement_status',
  type: 'select',
  category: 'engagement',
  tableColumn: true,
  options: [
    { value: 'engaged', labelKey: 'peopleGroups.options.engagementStatus.engaged' },
    { value: 'unengaged', labelKey: 'peopleGroups.options.engagementStatus.unengaged' }
  ]
}
