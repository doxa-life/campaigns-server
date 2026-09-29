import { getSql } from '../../../database/db'
import { peopleGroupReportService } from '../../../database/people-group-reports'
import { peopleGroupFieldLabel, peopleGroupFieldDisplay } from '../../../utils/app/people-group-field-labels'
import { readAddFields } from '../../../utils/app/add-report-fields'
import { tiptapToText } from '../../../utils/marketing-email-template'
import { allFields, isTableColumn } from '~/utils/people-group-fields'

function csvEscape(value: unknown): string {
  let str = value == null ? '' : String(value)
  // Neutralize CSV formula injection: reporter-supplied text can start with a
  // character Excel/Sheets would execute as a formula.
  if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

function isoDate(value: unknown): string {
  if (!value) return ''
  return new Date(value as string).toISOString().replace('T', ' ').slice(0, 16)
}

function fieldLabel(key: string): string {
  if (key === 'description_en') return 'Description'
  if (key === 'picture_credit') return 'Picture Credit'
  return peopleGroupFieldLabel(key)
}

function fieldDisplay(key: string, value: unknown): string {
  if (key === 'picture_credit' && Array.isArray(value)) return value.map(s => s.text).join('')
  return peopleGroupFieldDisplay(key, value)
}

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'people_groups.view')

  const query = getQuery(event)
  const status = query.status ? String(query.status) : undefined
  const search = query.search ? String(query.search) : undefined

  // 'awaiting_mine' is the page's per-approver view of the pending queue.
  const awaitingMine = status === 'awaiting_mine'
  let reports = await peopleGroupReportService.getAll({ status: awaitingMine ? 'pending' : status, search })
  if (awaitingMine) {
    reports = reports.filter(r => r.source === 'public' && !r.approvals?.some(a => a.user_id === user.userId))
  }

  const sql = getSql()
  const reportIds = reports.map(r => r.id)
  const groupIds = [...new Set(reports.map(r => r.people_group_id).filter((id): id is number => !!id))]
  const userIds = [...new Set(reports.flatMap(r => (r.approvals || []).map(a => a.user_id)).filter((id): id is string => !!id))]

  const [groups, users, comments] = await Promise.all([
    groupIds.length ? sql`SELECT * FROM people_groups WHERE id IN ${sql(groupIds)}` : [],
    userIds.length ? sql`SELECT id, display_name, email FROM users WHERE id IN ${sql(userIds)}` : [],
    reportIds.length
      ? sql`
          SELECT c.record_id, c.content, c.created_at,
            COALESCE(u.display_name, c.author_label, 'Unknown') as author_name
          FROM comments c
          LEFT JOIN users u ON c.user_id = u.id
          WHERE c.record_type = 'people_group_report' AND c.record_id IN ${sql(reportIds)}
          ORDER BY c.created_at ASC
        `
      : []
  ]) as [any[], any[], any[]]

  const groupById = new Map(groups.map(g => [g.id, g]))
  const userName = new Map(users.map(u => [u.id, u.display_name || u.email]))
  const commentsByReport = new Map<number, string[]>()
  for (const c of comments) {
    const lines = commentsByReport.get(c.record_id) || []
    lines.push(`[${isoDate(c.created_at)}] ${c.author_name}: ${tiptapToText(c.content)}`)
    commentsByReport.set(c.record_id, lines)
  }

  const siteUrl = useRuntimeConfig().public.siteUrl || 'http://localhost:3000'

  const pgidFor = (r: typeof reports[number], group: any) =>
    (group && (isTableColumn('imb_pgid') ? group.imb_pgid : group.metadata?.imb_pgid))
    || r.suggested_changes?.imb_pgid
    || r.people_group_uid
    || ''

  // Each report's changed fields, holding only the proposed value. The baseline
  // matches the review screen: the snapshot taken when the report was resolved,
  // otherwise the linked group's live values. With neither, every value is new.
  const changesByReport = new Map<number, Record<string, unknown>>()
  for (const r of reports) {
    const snapshot = r.status !== 'pending' ? r.previous_values : null
    const group = r.people_group_id ? groupById.get(r.people_group_id) : null
    const changes: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(r.suggested_changes || {})) {
      const baseline = snapshot
        ? snapshot[key]
        : group ? (isTableColumn(key) ? group[key] : (group.metadata || {})[key]) : undefined
      if ((snapshot || group) && String(baseline ?? '') === String(value ?? '')) continue
      changes[key] = value
    }
    // An add applies its completion fields, which reviewers may have corrected.
    if (r.type === 'add') {
      for (const [key, value] of Object.entries(readAddFields(r.add_fields).values || {})) {
        if (value !== null && value !== undefined && value !== '') changes[key] = value
      }
    }
    changesByReport.set(r.id, changes)
  }

  const fieldOrder = new Map(allFields.map((f, i) => [f.key, i]))
  const fieldKeys = [...new Set([...changesByReport.values()].flatMap(c => Object.keys(c)))]
    .sort((a, b) => (fieldOrder.get(a) ?? Infinity) - (fieldOrder.get(b) ?? Infinity) || a.localeCompare(b))

  const headers = [
    'ID', 'Submitted', 'Last Updated', 'Type', 'Source', 'Status',
    'People Group', 'People Group ID', 'People Group Slug', 'PGID',
    'Reporter Name', 'Reporter Email', 'Reporter Organization',
    'Verifier Name', 'Verifier Organization', 'Verifier Email',
    ...fieldKeys.map(fieldLabel),
    'Suggested Picture', 'Approvals', 'Notes & Comments'
  ]

  const rows = reports.map((r) => {
    const group = r.people_group_id ? groupById.get(r.people_group_id) : null
    const changes = changesByReport.get(r.id) || {}

    const approvals = (r.approvals || [])
      .map(a => `${userName.get(a.user_id) || a.user_id} (${isoDate(a.approved_at)})`)

    // The reporter's notes open the thread, followed by reviewer comments.
    const notesAndComments = [
      ...(r.notes ? [`[${isoDate(r.created_at)}] ${r.reporter_name}: ${r.notes}`] : []),
      ...(commentsByReport.get(r.id) || [])
    ]

    return [
      r.id,
      isoDate(r.created_at),
      isoDate(r.updated_at),
      r.type,
      r.source,
      r.status,
      r.people_group_name,
      r.people_group_id ?? '',
      r.people_group_slug ?? '',
      pgidFor(r, group),
      r.reporter_name,
      r.reporter_email ?? '',
      r.reporter_org ?? '',
      r.verifier_name ?? '',
      r.verifier_entity ?? '',
      r.verifier_email ?? '',
      ...fieldKeys.map(key => key in changes ? fieldDisplay(key, changes[key]) : ''),
      r.suggested_image_key ? `${siteUrl}/api/admin/people-group-reports/image/${r.suggested_image_key}` : '',
      approvals.join('\n'),
      notesAndComments.join('\n')
    ].map(csvEscape).join(',')
  })

  setResponseHeaders(event, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="people-group-reports-${new Date().toISOString().slice(0, 10)}.csv"`
  })

  // The BOM makes Excel read the file as UTF-8, which non-Latin names need.
  return '﻿' + [headers.join(','), ...rows].join('\n')
})
