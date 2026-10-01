import { describe, expect, it } from 'vitest'
import { getField } from '~/utils/people-group-fields'
import { guessImportTarget, IMPORT_COMMENT_TARGET, IMPORT_NAME_CHECK_TARGET, IMPORT_PEID_TARGET } from '~/utils/people-group-import'
import {
  commentParagraphs,
  importCommentContent,
  importCommentKey,
  normalizePeid,
  parseImportValue,
  planPeopleGroupImport,
  type ImportPeopleGroup
} from '../../server/utils/app/people-group-import'

const englishLabels: Record<string, string> = {
  'peopleGroups.fields.engagement_status': 'Engagement Status',
  'peopleGroups.fields.believers_count': 'Believers Count',
  'peopleGroups.fields.workers_long_term': 'Long-Term Presence'
}
const labelFor = (field: { labelKey: string }) => englishLabels[field.labelKey] ?? field.labelKey

function group(overrides: Partial<ImportPeopleGroup> & { peid: string }): ImportPeopleGroup {
  const { peid, ...rest } = overrides
  return {
    id: Number(peid),
    name: `Group ${peid}`,
    slug: `group-${peid}`,
    status: 'active',
    engagement_status: 'unengaged',
    metadata: { imb_peid: peid },
    ...rest
  }
}

function byPeid(...groups: ImportPeopleGroup[]): Map<string, ImportPeopleGroup[]> {
  const map = new Map<string, ImportPeopleGroup[]>()
  for (const g of groups) map.set(String(g.metadata!.imb_peid), [...(map.get(String(g.metadata!.imb_peid)) ?? []), g])
  return map
}

describe('guessImportTarget', () => {
  it('maps the partner sheet headers', () => {
    expect(guessImportTarget('IMB PEID', labelFor)).toBe(IMPORT_PEID_TARGET)
    expect(guessImportTarget('PEID', labelFor)).toBe(IMPORT_PEID_TARGET)
    expect(guessImportTarget('UUPG name', labelFor)).toBe(IMPORT_NAME_CHECK_TARGET)
    expect(guessImportTarget('Name', labelFor)).toBe(IMPORT_NAME_CHECK_TARGET)
    expect(guessImportTarget('Engagement Status', labelFor)).toBe('engagement_status')
    expect(guessImportTarget('Verified By', labelFor)).toBe('engagement_verified_by')
    expect(guessImportTarget('Baptisms', labelFor)).toBe('baptisms_count')
    expect(guessImportTarget('Long-Term Presence', labelFor)).toBe('workers_long_term')
    expect(guessImportTarget('Source Detail', labelFor)).toBe(IMPORT_COMMENT_TARGET)
    expect(guessImportTarget('Review Note', labelFor)).toBe(IMPORT_COMMENT_TARGET)
    expect(guessImportTarget('Engaged According To', labelFor)).toBeNull()
  })
})

describe('parseImportValue', () => {
  it('reads selects by value or English label', () => {
    expect(parseImportValue(getField('engagement_status')!, 'Engaged')).toEqual({ value: 'engaged' })
    expect(parseImportValue(getField('reason_engaged')!, 'Partner Report')).toEqual({ value: 'partner_report' })
    expect(parseImportValue(getField('engagement_status')!, 'maybe')).toHaveProperty('error')
  })

  it('reads numbers with separators and rejects fractions for whole-number fields', () => {
    expect(parseImportValue(getField('baptisms_count')!, '1,250')).toEqual({ value: 1250 })
    expect(parseImportValue(getField('baptisms_count')!, '2.5')).toHaveProperty('error')
    expect(parseImportValue(getField('baptisms_count')!, 'many')).toHaveProperty('error')
  })

  it('reads yes/no booleans', () => {
    expect(parseImportValue(getField('workers_long_term')!, 'Yes')).toEqual({ value: true })
    expect(parseImportValue(getField('workers_long_term')!, 'n')).toEqual({ value: false })
    expect(parseImportValue(getField('workers_long_term')!, 'sometimes')).toHaveProperty('error')
  })

  it('reads countries by code or name', () => {
    expect(parseImportValue(getField('country_code')!, 'IND')).toEqual({ value: 'IND' })
    expect(parseImportValue(getField('country_code')!, 'in')).toEqual({ value: 'IND' })
    expect(parseImportValue(getField('country_code')!, 'India')).toEqual({ value: 'IND' })
  })
})

describe('normalizePeid', () => {
  it('drops a spreadsheet decimal', () => {
    expect(normalizePeid(' 48057.0 ')).toBe('48057')
  })
})

describe('planPeopleGroupImport', () => {
  const mapping = {
    'IMB PEID': IMPORT_PEID_TARGET,
    'Name': IMPORT_NAME_CHECK_TARGET,
    'Engagement Status': 'engagement_status',
    'Verified By': 'engagement_verified_by',
    'Baptisms': 'baptisms_count'
  }

  it('marks a group engaged with the partner reason and its verifiers', () => {
    const plan = planPeopleGroupImport(
      [{ 'IMB PEID': '100', 'Name': 'Group 100', 'Engagement Status': 'engaged', 'Verified By': 'IMA, Mission India' }],
      mapping,
      byPeid(group({ peid: '100' }))
    )
    expect(plan.errors).toEqual([])
    expect(plan.warnings).toEqual([])
    expect(plan.rows).toHaveLength(1)
    expect(plan.rows[0]!.becomes_engaged).toBe(true)
    expect(Object.fromEntries(plan.rows[0]!.changes.map(c => [c.field, c.to]))).toEqual({
      engagement_status: 'engaged',
      engagement_verified_by: 'IMA, Mission India',
      reason_engaged: 'partner_report'
    })
  })

  it('leaves blank cells and matching values alone', () => {
    const plan = planPeopleGroupImport(
      [{ 'IMB PEID': '101', 'Engagement Status': 'unengaged' }],
      mapping,
      byPeid(group({ peid: '101' }))
    )
    expect(plan.rows).toEqual([])
    expect(plan.unchanged).toBe(1)
  })

  it('reports unknown and repeated PEIDs, bad cells and name differences', () => {
    const plan = planPeopleGroupImport(
      [
        { 'IMB PEID': '999', 'Engagement Status': 'engaged' },
        { 'IMB PEID': '102', 'Name': 'Someone Else', 'Baptisms': '12' },
        { 'IMB PEID': '102', 'Baptisms': '3' },
        { 'IMB PEID': '103', 'Baptisms': 'lots' }
      ],
      mapping,
      byPeid(group({ peid: '102' }), group({ peid: '103' }))
    )
    expect(plan.errors.map(e => e.row)).toEqual([2, 4, 5])
    expect(plan.warnings).toHaveLength(1)
    expect(plan.warnings[0]!.row).toBe(3)
    expect(plan.rows.map(r => r.peid)).toEqual(['102'])
  })

  it('gathers comment columns into one comment and skips one the group already has', () => {
    const commentMapping = { 'IMB PEID': IMPORT_PEID_TARGET, 'Source Detail': IMPORT_COMMENT_TARGET, 'Review Note': IMPORT_COMMENT_TARGET }
    const rows = [
      { 'IMB PEID': '104', 'Source Detail': 'IMA #426: Odisha', 'Review Note': 'Check locations' },
      { 'IMB PEID': '105', 'Source Detail': 'FF: TTi 4/16' },
      { 'IMB PEID': '106' }
    ]
    const groups = byPeid(group({ peid: '104' }), group({ peid: '105' }), group({ peid: '106' }))
    const existing = new Map([[105, new Set([importCommentKey(commentParagraphs(importCommentContent(['Source Detail: FF: TTi 4/16'])))])]])

    const plan = planPeopleGroupImport(rows, commentMapping, groups, existing)
    expect(plan.rows).toHaveLength(1)
    expect(plan.rows[0]!.changes).toEqual([])
    expect(plan.rows[0]!.comment).toEqual(['Source Detail: IMA #426: Odisha', 'Review Note: Check locations'])
    expect(plan.unchanged).toBe(2)
    expect(plan.field_counts).toEqual({ Comment: 1 })
  })

  it('requires a PEID column', () => {
    expect(() => planPeopleGroupImport([], { Baptisms: 'baptisms_count' }, new Map())).toThrow()
  })
})
