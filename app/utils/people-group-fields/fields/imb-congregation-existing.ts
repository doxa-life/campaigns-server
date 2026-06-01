import type { FieldDefinition } from '../types'

export const field: FieldDefinition = {
  key: 'imb_congregation_existing',
  labelKey: 'peopleGroups.fields.imb_congregation_existing',
  type: 'select',
  category: 'engagement',
  options: [
    { value: '0', labelKey: 'peopleGroups.options.yesNo.no' },
    { value: '1', labelKey: 'peopleGroups.options.yesNo.yes' }
  ]
}
