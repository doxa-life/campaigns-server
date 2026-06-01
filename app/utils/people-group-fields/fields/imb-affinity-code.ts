import type { FieldDefinition } from '../types'

export const field: FieldDefinition = {
  key: 'imb_affinity_code',
  labelKey: 'peopleGroups.fields.imb_affinity_code',
  type: 'select',
  category: 'geography',
  options: [
    { value: 'AG800', labelKey: 'peopleGroups.options.affinityCode.AG800' },
    { value: 'AG650', labelKey: 'peopleGroups.options.affinityCode.AG650' },
    { value: 'AG400', labelKey: 'peopleGroups.options.affinityCode.AG400' },
    { value: 'AG900', labelKey: 'peopleGroups.options.affinityCode.AG900' },
    { value: 'AG100', labelKey: 'peopleGroups.options.affinityCode.AG100' },
    { value: 'AG200', labelKey: 'peopleGroups.options.affinityCode.AG200' },
    { value: 'AG500', labelKey: 'peopleGroups.options.affinityCode.AG500' },
    { value: 'AG300', labelKey: 'peopleGroups.options.affinityCode.AG300' }
  ]
}
