import type { FieldDefinition } from '../types'

export const field: FieldDefinition = {
  key: 'engagement_verified_by',
  labelKey: 'peopleGroups.fields.engagement_verified_by',
  type: 'text',
  category: 'engagement',
  showIf: { field: 'engagement_status', value: 'engaged' },
  private: true,
  description: 'Partners who confirmed the engagement, comma-separated'
}
