import type { FieldDefinition } from '../types'

export const field: FieldDefinition = {
  key: 'reason_engaged',
  labelKey: 'peopleGroups.fields.reason_engaged',
  type: 'select',
  category: 'engagement',
  showIf: { field: 'engagement_status', value: 'engaged' },
  options: [
    { value: 'imb_report', labelKey: 'peopleGroups.options.reasonEngaged.imb_report' },
    { value: 'agwm_report', labelKey: 'peopleGroups.options.reasonEngaged.agwm_report' },
    { value: 'doxa_report', labelKey: 'peopleGroups.options.reasonEngaged.doxa_report' }
  ]
}
