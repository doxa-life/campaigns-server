import { allFields, type FieldDefinition } from './people-group-fields'

/** Mapping target for the column holding each row's IMB PEID, which matches the row to a people group. */
export const IMPORT_PEID_TARGET = 'imb_peid'

/** Mapping target that compares a column with the group's name and warns on a difference, changing nothing. */
export const IMPORT_NAME_CHECK_TARGET = '__name_check__'

/** Mapping target that adds the cell to a comment on the group; several columns may share it. */
export const IMPORT_COMMENT_TARGET = '__comment__'

const IMPORTABLE_TYPES = new Set(['text', 'textarea', 'number', 'boolean', 'select'])

/** Fields a CSV column can write to. The PEID matches rows and the name is only checked, so neither is written. */
export const importableFields: FieldDefinition[] = allFields.filter(f =>
  IMPORTABLE_TYPES.has(f.type)
  && !f.readOnly
  && !f.hidden
  && f.key !== IMPORT_PEID_TARGET
  && f.key !== 'name'
)

const importableKeys = new Set(importableFields.map(f => f.key))

export function isImportTarget(target: string): boolean {
  return target === IMPORT_PEID_TARGET
    || target === IMPORT_NAME_CHECK_TARGET
    || target === IMPORT_COMMENT_TARGET
    || importableKeys.has(target)
}

/** Header names the importer treats as a target when guessing a mapping, beyond the field's key and label. */
const IMPORT_ALIASES: Record<string, string[]> = {
  [IMPORT_PEID_TARGET]: ['peid', 'imb peid', 'people id'],
  [IMPORT_NAME_CHECK_TARGET]: ['name', 'uupg name', 'people group', 'people group name'],
  engagement_status: ['engagement', 'engaged'],
  engagement_verified_by: ['verified by', 'verifiers'],
  believers_count: ['believers'],
  baptisms_count: ['baptisms', 'baptism'],
  churches_count: ['churches'],
  [IMPORT_COMMENT_TARGET]: ['comment', 'comments', 'note', 'notes', 'source detail', 'review note']
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[_\s]+/g, ' ')
}

/** Target a CSV header most likely holds, by exact key, label or alias match, or null. */
export function guessImportTarget(header: string, labelFor: (field: FieldDefinition) => string): string | null {
  const normalized = normalizeHeader(header)
  for (const [target, aliases] of Object.entries(IMPORT_ALIASES)) {
    if (aliases.includes(normalized)) return target
  }
  if (normalized === normalizeHeader(IMPORT_PEID_TARGET)) return IMPORT_PEID_TARGET
  for (const field of importableFields) {
    if (normalized === normalizeHeader(field.key) || normalized === normalizeHeader(labelFor(field))) return field.key
  }
  return null
}
