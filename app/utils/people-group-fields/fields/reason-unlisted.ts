import type { FieldDefinition } from '../types'

export const field: FieldDefinition = {
  key: 'reason_unlisted',
  labelKey: 'peopleGroups.fields.reason_unlisted',
  type: 'select',
  category: 'engagement',
  showIf: { field: 'status', value: 'archived' },
  options: [
    { value: 'is_diaspora', labelKey: 'peopleGroups.options.reasonUnlisted.is_diaspora' },
    { value: 'historically_christian', labelKey: 'peopleGroups.options.reasonUnlisted.historically_christian' },
    { value: 'merged_or_deleted', labelKey: 'peopleGroups.options.reasonUnlisted.merged_or_deleted' }
  ]
}
