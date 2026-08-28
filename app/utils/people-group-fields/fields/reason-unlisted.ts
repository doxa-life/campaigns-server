import type { FieldDefinition } from '../types'

export const field: FieldDefinition = {
  key: 'reason_unlisted',
  labelKey: 'peopleGroups.fields.reason_unlisted',
  type: 'select',
  category: 'status',
  showIf: { field: 'status', value: 'archived' },
  options: [
    { value: 'is_diaspora', labelKey: 'peopleGroups.options.reasonUnlisted.is_diaspora' },
    { value: 'historically_christian', labelKey: 'peopleGroups.options.reasonUnlisted.historically_christian' },
    { value: 'merged_or_deleted', labelKey: 'peopleGroups.options.reasonUnlisted.merged_or_deleted' },
    { value: 'no_longer_exists', labelKey: 'peopleGroups.options.reasonUnlisted.no_longer_exists' },
    { value: 'gsec_above_2', labelKey: 'peopleGroups.options.reasonUnlisted.gsec_above_2' }
  ]
}
