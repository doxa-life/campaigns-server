import { peopleGroupService, type UpdatePeopleGroupData } from '../../../database/people-groups'
import { commentService } from '../../../database/comments'
import { getSql } from '#server/database/db'
import { getErrorMessage } from '#server/utils/api-helpers'
import { parseCsv } from '#shared/csv'
import { trackEventInBackground } from '#server/utils/tracking'
import {
  commentParagraphs,
  importCommentContent,
  importCommentKey,
  normalizePeid,
  planPeopleGroupImport,
  splitImportChanges,
  validateImportMapping,
  type ImportIssue,
  type ImportPeopleGroup
} from '#server/utils/app/people-group-import'

const MAX_ROWS = 5000
const CONCURRENCY_LIMIT = 10

/**
 * Multipart CSV import that updates existing people groups matched by IMB PEID.
 * `mapping` pairs CSV headers with field keys, or with the comment target, whose
 * cells become one comment per group; `dry_run=true` returns the plan without
 * writing. Changes are logged under the "CSV Import" badge, which the
 * IMB update tooling treats as manual edits, so later IMB runs keep them.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUnscopedPermission(event, 'people_groups.edit')

  const formData = await readMultipartFormData(event)
  const file = formData?.find(f => f.name === 'file')
  if (!file?.data?.length) {
    throw createError({ statusCode: 400, statusMessage: 'No CSV file uploaded' })
  }

  let mapping: Record<string, string>
  try {
    mapping = JSON.parse(formData!.find(f => f.name === 'mapping')?.data.toString('utf-8') || '{}')
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Column mapping is not valid JSON' })
  }
  const peidHeader = validateImportMapping(mapping)
  const dryRun = formData!.find(f => f.name === 'dry_run')?.data.toString('utf-8') === 'true'

  const rows = parseCsv(file.data.toString('utf-8').replace(/^﻿/, ''))
  if (rows.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'The CSV has no data rows' })
  }
  if (rows.length > MAX_ROWS) {
    throw createError({ statusCode: 400, statusMessage: `The CSV has more than ${MAX_ROWS} rows` })
  }

  const peids = [...new Set(rows.map(r => normalizePeid(r[peidHeader])).filter(Boolean))]
  const sql = getSql()
  const groups = peids.length > 0
    ? await sql`SELECT * FROM people_groups WHERE metadata->>'imb_peid' IN ${sql(peids)}` as ImportPeopleGroup[]
    : []
  const groupsByPeid = new Map<string, ImportPeopleGroup[]>()
  for (const group of groups) {
    const peid = String(group.metadata?.imb_peid ?? '')
    groupsByPeid.set(peid, [...(groupsByPeid.get(peid) ?? []), group])
  }

  const existingComments = new Map<number, Set<string>>()
  if (groups.length > 0) {
    const comments = await sql`
      SELECT record_id, content FROM comments
      WHERE record_type = 'people_group' AND record_id IN ${sql(groups.map(g => g.id))}
    ` as { record_id: number; content: Record<string, any> }[]
    for (const comment of comments) {
      const keys = existingComments.get(comment.record_id) ?? new Set<string>()
      keys.add(importCommentKey(commentParagraphs(comment.content)))
      existingComments.set(comment.record_id, keys)
    }
  }

  const plan = planPeopleGroupImport(rows, mapping, groupsByPeid, existingComments)
  if (dryRun) return { dry_run: true, ...plan }

  const filename = file.filename || 'CSV file'
  const failed: ImportIssue[] = []
  let updated = 0

  for (let c = 0; c < plan.rows.length; c += CONCURRENCY_LIMIT) {
    const chunk = plan.rows.slice(c, c + CONCURRENCY_LIMIT)
    const results = await Promise.allSettled(chunk.map(async (rowPlan) => {
      if (rowPlan.changes.length > 0) {
        const { columns, metadata } = splitImportChanges(rowPlan.changes)
        const updateData: UpdatePeopleGroupData = { ...columns }
        if (Object.keys(metadata).length > 0) {
          updateData.metadata = metadata
          updateData.mergeMetadata = true
        }
        const result = await peopleGroupService.updatePeopleGroup(rowPlan.people_group_id, updateData)
        if (!result) throw new Error('People group not found')
      }
      if (rowPlan.comment) {
        await commentService.create({
          record_type: 'people_group',
          record_id: rowPlan.people_group_id,
          user_id: user.userId,
          content: importCommentContent(rowPlan.comment)
        })
      }
      return rowPlan
    }))

    results.forEach((settled, i) => {
      const rowPlan = chunk[i]!
      if (settled.status === 'rejected') {
        failed.push({ row: rowPlan.row, peid: rowPlan.peid, message: getErrorMessage(settled.reason) })
        return
      }
      updated++
      if (rowPlan.changes.length === 0) return
      logUpdate('people_groups', String(rowPlan.people_group_id), event, {
        badge: 'CSV Import',
        message: `Imported from ${filename}, row ${rowPlan.row}`,
        changes: Object.fromEntries(rowPlan.changes.map(ch => [ch.field, { from: ch.from, to: ch.to }]))
      })
      if (rowPlan.becomes_engaged) {
        trackEventInBackground(event, {
          eventType: 'people_group_engaged',
          metadata: {
            people_group_slug: rowPlan.slug,
            people_group_id: rowPlan.people_group_id,
            source: 'csv_import'
          }
        })
      }
    })
  }

  return {
    dry_run: false,
    total: plan.total,
    matched: plan.matched,
    unchanged: plan.unchanged,
    updated,
    failed,
    errors: plan.errors,
    warnings: plan.warnings,
    field_counts: plan.field_counts
  }
})
