import { createError } from 'h3'
import countries from 'i18n-iso-countries'
import { getField, isTableColumn, type FieldDefinition } from '~/utils/people-group-fields'
import { IMPORT_COMMENT_TARGET, IMPORT_NAME_CHECK_TARGET, IMPORT_PEID_TARGET, isImportTarget } from '~/utils/people-group-import'
import { peopleGroupFieldDisplay, peopleGroupFieldLabel } from './people-group-field-labels'

export type ImportValue = string | number | boolean

/** The people group columns the import reads; metadata holds every field that is not a table column. */
export interface ImportPeopleGroup {
  id: number
  name: string
  slug: string | null
  status: string | null
  engagement_status: string | null
  metadata: Record<string, any> | null
  [column: string]: unknown
}

export interface ImportChange {
  field: string
  label: string
  from: unknown
  to: ImportValue
  from_display: string
  to_display: string
}

export interface ImportRowPlan {
  row: number
  peid: string
  people_group_id: number
  slug: string | null
  name: string
  changes: ImportChange[]
  /** Paragraphs of the comment the row adds, "Column: value" each; null when it adds none. */
  comment: string[] | null
  becomes_engaged: boolean
}

export interface ImportIssue {
  row: number
  peid: string | null
  message: string
}

export interface ImportPlan {
  total: number
  matched: number
  unchanged: number
  rows: ImportRowPlan[]
  errors: ImportIssue[]
  warnings: ImportIssue[]
  field_counts: Record<string, number>
}

/** Key under which `field_counts` counts the groups that get a comment. */
export const IMPORT_COMMENT_COUNT_LABEL = 'Comment'

/** Reason recorded when the import marks a group engaged and the file gives none. */
export const IMPORT_REASON_ENGAGED = 'partner_report'

const TRUE_WORDS = new Set(['yes', 'y', 'true', '1'])
const FALSE_WORDS = new Set(['no', 'n', 'false', '0'])

/** PEID as stored, from a cell a spreadsheet may have written as "48057.0". */
export function normalizePeid(raw: string | undefined): string {
  return (raw ?? '').trim().replace(/\.0+$/, '')
}

/**
 * Check a column mapping (CSV header → target) and return the PEID header.
 * Throws a 400 for an unknown target, a field target used twice, or no PEID column.
 */
export function validateImportMapping(mapping: Record<string, string>): string {
  const used = new Set<string>()
  let peidHeader: string | null = null
  for (const [header, target] of Object.entries(mapping)) {
    if (!isImportTarget(target)) {
      throw createError({ statusCode: 400, statusMessage: `Unknown field: ${target}` })
    }
    if (used.has(target) && target !== IMPORT_COMMENT_TARGET) {
      throw createError({ statusCode: 400, statusMessage: `Two columns are mapped to ${targetLabel(target)}` })
    }
    used.add(target)
    if (target === IMPORT_PEID_TARGET) peidHeader = header
  }
  if (!peidHeader) {
    throw createError({ statusCode: 400, statusMessage: 'A column must be mapped to the IMB PEID' })
  }
  return peidHeader
}

function targetLabel(target: string): string {
  if (target === IMPORT_NAME_CHECK_TARGET) return 'Name (check only)'
  if (target === IMPORT_COMMENT_TARGET) return 'Comment'
  return peopleGroupFieldLabel(target)
}

const optionLabelCache = new Map<string, Map<string, string>>()

/** Lower-cased English label → option value, for a select field. */
function optionsByLabel(field: FieldDefinition): Map<string, string> {
  let map = optionLabelCache.get(field.key)
  if (!map) {
    map = new Map()
    for (const option of field.options ?? []) {
      map.set(peopleGroupFieldDisplay(field.key, option.value).toLowerCase(), option.value)
    }
    optionLabelCache.set(field.key, map)
  }
  return map
}

/** Stored value for one CSV cell, or why it cannot be stored. */
export function parseImportValue(field: FieldDefinition, raw: string): { value: ImportValue } | { error: string } {
  const text = raw.trim()
  const label = peopleGroupFieldLabel(field.key)

  if (field.type === 'number') {
    const cleaned = text.replace(/[,\s]/g, '')
    const n = Number(cleaned)
    if (cleaned === '' || !Number.isFinite(n)) return { error: `${label}: "${text}" is not a number` }
    if (field.integer && (!Number.isInteger(n) || n < 0)) return { error: `${label}: "${text}" is not a whole number` }
    return { value: n }
  }

  if (field.type === 'boolean') {
    const word = text.toLowerCase()
    if (TRUE_WORDS.has(word)) return { value: true }
    if (FALSE_WORDS.has(word)) return { value: false }
    return { error: `${label}: "${text}" is not yes or no` }
  }

  if (field.type === 'select') {
    if (field.optionsSource === 'countries') {
      const upper = text.toUpperCase()
      const code = upper.length === 3 && countries.isValid(upper)
        ? upper
        : upper.length === 2 && countries.isValid(upper)
          ? countries.alpha2ToAlpha3(upper)
          : countries.getAlpha3Code(text, 'en')
      return code ? { value: code } : { error: `${label}: "${text}" is not a country` }
    }
    const lower = text.toLowerCase()
    const byValue = field.options?.find(o => o.value.toLowerCase() === lower)
    if (byValue) return { value: byValue.value }
    const byLabel = optionsByLabel(field).get(lower)
    if (byLabel !== undefined) return { value: byLabel }
    return { error: `${label}: "${text}" is not one of its options` }
  }

  return { value: text }
}

function currentValue(group: ImportPeopleGroup, key: string): unknown {
  return isTableColumn(key) ? group[key] : group.metadata?.[key]
}

function sameValue(field: FieldDefinition, current: unknown, next: ImportValue): boolean {
  if (current === null || current === undefined || current === '') return false
  if (field.type === 'boolean') {
    const asBool = current === true || current === '1' || current === 'true'
      ? true
      : current === false || current === '0' || current === 'false' ? false : null
    return asBool === next
  }
  if (field.type === 'number') return Number(current) === next
  return String(current) === String(next)
}

function normalizeName(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Comment paragraphs as their text, one per line: the key a repeated import is recognised by. */
export function importCommentKey(paragraphs: string[]): string {
  return paragraphs.join('\n')
}

/** Tiptap document holding one paragraph per line of text. */
export function importCommentContent(paragraphs: string[]): Record<string, any> {
  return {
    type: 'doc',
    content: paragraphs.map(text => ({ type: 'paragraph', content: [{ type: 'text', text }] }))
  }
}

/** The paragraph texts of a stored comment, for comparison with `importCommentKey`. */
export function commentParagraphs(content: Record<string, any> | null): string[] {
  const blocks: any[] = Array.isArray(content?.content) ? content!.content : []
  return blocks.map(block => (Array.isArray(block?.content) ? block.content : [])
    .map((node: any) => (typeof node?.text === 'string' ? node.text : ''))
    .join(''))
}

/**
 * Work out what a CSV import changes, without writing anything. Rows are
 * matched to people groups by PEID; a blank cell leaves its field as it is. A
 * row with any cell that cannot be stored is skipped whole and reported. A
 * comment the group already has, by `importCommentKey`, is not added again.
 * Row numbers count the header as line 1, matching the spreadsheet.
 */
export function planPeopleGroupImport(
  rows: Record<string, string>[],
  mapping: Record<string, string>,
  groupsByPeid: Map<string, ImportPeopleGroup[]>,
  existingComments: Map<number, Set<string>> = new Map()
): ImportPlan {
  const peidHeader = validateImportMapping(mapping)
  const fieldColumns = Object.entries(mapping)
    .filter(([, target]) => target !== IMPORT_PEID_TARGET && target !== IMPORT_NAME_CHECK_TARGET && target !== IMPORT_COMMENT_TARGET)
    .map(([header, target]) => ({ header, field: getField(target)! }))
  const commentHeaders = Object.entries(mapping)
    .filter(([, target]) => target === IMPORT_COMMENT_TARGET)
    .map(([header]) => header)
  const nameHeader = Object.entries(mapping).find(([, target]) => target === IMPORT_NAME_CHECK_TARGET)?.[0]
  const reasonMapped = fieldColumns.some(c => c.field.key === 'reason_engaged')

  const plan: ImportPlan = { total: rows.length, matched: 0, unchanged: 0, rows: [], errors: [], warnings: [], field_counts: {} }
  const seen = new Map<string, number>()

  rows.forEach((row, index) => {
    const rowNumber = index + 2
    const peid = normalizePeid(row[peidHeader])
    if (!peid) {
      plan.errors.push({ row: rowNumber, peid: null, message: 'No PEID' })
      return
    }
    if (seen.has(peid)) {
      plan.errors.push({ row: rowNumber, peid, message: `PEID already appears on row ${seen.get(peid)}` })
      return
    }
    seen.set(peid, rowNumber)

    const matches = groupsByPeid.get(peid) ?? []
    if (matches.length === 0) {
      plan.errors.push({ row: rowNumber, peid, message: 'No people group has this PEID' })
      return
    }
    if (matches.length > 1) {
      plan.errors.push({ row: rowNumber, peid, message: `${matches.length} people groups share this PEID` })
      return
    }
    const group = matches[0]!
    plan.matched++

    const cellErrors: string[] = []
    const changes: ImportChange[] = []
    for (const { header, field } of fieldColumns) {
      const raw = row[header]
      if (raw === undefined || raw.trim() === '') continue
      const parsed = parseImportValue(field, raw)
      if ('error' in parsed) {
        cellErrors.push(parsed.error)
        continue
      }
      const from = currentValue(group, field.key)
      if (sameValue(field, from, parsed.value)) continue
      changes.push({
        field: field.key,
        label: peopleGroupFieldLabel(field.key),
        from: from ?? null,
        to: parsed.value,
        from_display: peopleGroupFieldDisplay(field.key, from),
        to_display: peopleGroupFieldDisplay(field.key, parsed.value)
      })
    }
    if (cellErrors.length > 0) {
      plan.errors.push({ row: rowNumber, peid, message: cellErrors.join('; ') })
      return
    }

    if (nameHeader && row[nameHeader] && normalizeName(row[nameHeader]) !== normalizeName(group.name)) {
      plan.warnings.push({ row: rowNumber, peid, message: `Name in the file is "${row[nameHeader]}", the people group is "${group.name}"` })
    }

    const becomesEngaged = group.engagement_status !== 'engaged'
      && changes.some(c => c.field === 'engagement_status' && c.to === 'engaged')
    const reasonInRow = reasonMapped && changes.some(c => c.field === 'reason_engaged')
    if (becomesEngaged && !reasonInRow && currentValue(group, 'reason_engaged') !== IMPORT_REASON_ENGAGED) {
      const from = currentValue(group, 'reason_engaged')
      changes.push({
        field: 'reason_engaged',
        label: peopleGroupFieldLabel('reason_engaged'),
        from: from ?? null,
        to: IMPORT_REASON_ENGAGED,
        from_display: peopleGroupFieldDisplay('reason_engaged', from),
        to_display: peopleGroupFieldDisplay('reason_engaged', IMPORT_REASON_ENGAGED)
      })
    }

    const paragraphs = commentHeaders
      .filter(header => row[header]?.trim())
      .map(header => `${header}: ${row[header]!.trim()}`)
    const comment = paragraphs.length > 0 && !existingComments.get(group.id)?.has(importCommentKey(paragraphs))
      ? paragraphs
      : null

    if (changes.length === 0 && !comment) {
      plan.unchanged++
      return
    }
    if (group.status === 'archived') {
      plan.warnings.push({ row: rowNumber, peid, message: `${group.name} is archived` })
    }
    for (const change of changes) {
      plan.field_counts[change.label] = (plan.field_counts[change.label] ?? 0) + 1
    }
    if (comment) {
      plan.field_counts[IMPORT_COMMENT_COUNT_LABEL] = (plan.field_counts[IMPORT_COMMENT_COUNT_LABEL] ?? 0) + 1
    }
    plan.rows.push({
      row: rowNumber,
      peid,
      people_group_id: group.id,
      slug: group.slug,
      name: group.name,
      changes,
      comment,
      becomes_engaged: becomesEngaged
    })
  })

  return plan
}

/** Split a row's changes into table columns and metadata, as the people group update takes them. */
export function splitImportChanges(changes: ImportChange[]): { columns: Record<string, ImportValue>; metadata: Record<string, ImportValue> } {
  const columns: Record<string, ImportValue> = {}
  const metadata: Record<string, ImportValue> = {}
  for (const change of changes) {
    if (isTableColumn(change.field)) columns[change.field] = change.to
    else metadata[change.field] = change.to
  }
  return { columns, metadata }
}
