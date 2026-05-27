import type { FieldType, Operator } from '#shared/crm/filter-types'

export type ValueLoader = () => Promise<{ label: string; value: unknown }[]>

export interface ClientFieldDef {
  key: string
  label: string
  type: FieldType
  // For enum/enum-multi/foreign-key fields. Either static values or a loader
  // that's resolved on first use.
  values?: { label: string; value: unknown }[]
  valuesLoader?: ValueLoader
  // Limit operator choices for this field. Defaults from operatorsForType().
  operators?: Operator[]
}

export type ClientManifest = ClientFieldDef[]

export interface OperatorChoice {
  value: Operator
  label: string
  // True if this operator does not need a value input (e.g. is_true, empty).
  noValue?: boolean
  // For date: a "between" operator with the preset picker UI.
  dateBetween?: boolean
}

const OPERATORS_BY_TYPE: Record<FieldType, OperatorChoice[]> = {
  text: [
    { value: 'contains', label: 'contains' },
    { value: 'eq', label: 'equals' },
    { value: 'starts_with', label: 'starts with' },
    { value: 'empty', label: 'is empty', noValue: true },
    { value: 'not_empty', label: 'is not empty', noValue: true },
  ],
  number: [
    { value: 'eq', label: '=' },
    { value: 'neq', label: '≠' },
    { value: 'gt', label: '>' },
    { value: 'lt', label: '<' },
    { value: 'between', label: 'between' },
  ],
  date: [
    { value: 'after', label: 'on or after' },
    { value: 'before', label: 'before' },
    { value: 'between', label: 'between', dateBetween: true },
  ],
  boolean: [
    { value: 'is_true', label: 'is true', noValue: true },
    { value: 'is_false', label: 'is false', noValue: true },
  ],
  enum: [
    { value: 'is', label: 'is' },
    { value: 'is_not', label: 'is not' },
  ],
  'enum-multi': [
    { value: 'includes_any', label: 'includes any of' },
    { value: 'includes_all', label: 'includes all of' },
    { value: 'excludes', label: 'excludes' },
  ],
  'foreign-key': [
    { value: 'is', label: 'is' },
    { value: 'is_not', label: 'is not' },
  ],
}

export function operatorsForField(field: ClientFieldDef): OperatorChoice[] {
  const all = OPERATORS_BY_TYPE[field.type]
  if (!field.operators) return all
  return all.filter(o => field.operators!.includes(o.value))
}
