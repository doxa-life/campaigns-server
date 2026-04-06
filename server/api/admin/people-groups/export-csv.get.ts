import { getSql } from '../../../database/db'
import { formatPeopleGroup, INTERNAL_TO_ALIAS } from '../../../utils/app/people-group-formatter'
import { allFields } from '../../../utils/app/field-options'

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"'
  }
  return value
}

function flattenValue(val: unknown): string {
  if (val === null || val === undefined) return ''
  if (typeof val === 'object' && 'label' in (val as any)) return String((val as any).label ?? '')
  return String(val)
}

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'people_groups.view')

  const sql = getSql()
  const peopleGroups = await sql`
    SELECT pg.*
    FROM people_groups pg
    ORDER BY pg.name
  ` as any[]

  const fields = ['id', 'name', 'slug', ...allFields.map(f => INTERNAL_TO_ALIAS[f.key] || f.key)]

  const rows = peopleGroups.map(pg => {
    const formatted = formatPeopleGroup(pg, { fields: 'all', lang: 'en' })
    return fields.map(key => escapeCsvField(flattenValue(formatted[key]))).join(',')
  })

  const csv = [fields.join(','), ...rows].join('\n')

  setResponseHeaders(event, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="people-groups-export-${new Date().toISOString().slice(0, 10)}.csv"`,
  })

  return csv
})
