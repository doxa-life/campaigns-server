export type FieldType = 'text' | 'select' | 'boolean'

export interface GroupFieldDefinition {
  key: string
  label: string
  type: FieldType
  description?: string
  readOnly?: boolean
}

export const groupFields: GroupFieldDefinition[] = [
  { key: 'name', label: 'Name', type: 'text', description: 'Name of the group or church' },
  { key: 'primary_subscriber_id', label: 'Primary Contact', type: 'select', description: 'Main point of contact for this group' },
  { key: 'country', label: 'Country', type: 'select', description: 'Country where the group is located' },
  { key: 'description', label: 'Description', type: 'text', description: 'Description of the group' },
  { key: 'status', label: 'Status', type: 'select', description: 'Group status' },
  { key: 'show_publicly', label: 'Show Publicly', type: 'boolean', description: 'Whether the adoption is displayed publicly' },
]

const fieldMap = new Map(groupFields.map(f => [f.key, f]))

export function getGroupField(key: string): GroupFieldDefinition | undefined {
  return fieldMap.get(key)
}

export function getGroupFieldLabel(key: string): string {
  return fieldMap.get(key)?.label || key
}
