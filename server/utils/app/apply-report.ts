import type { H3Event } from 'h3'
import { createError } from 'h3'
import { peopleGroupReportService, type PeopleGroupReportWithDetails } from '../../database/people-group-reports'
import { peopleGroupService, type PeopleGroup, type UpdatePeopleGroupData } from '../../database/people-groups'
import { isTableColumn } from '~/utils/people-group-fields'
import { logUpdate, logCreate } from '../activity-logger'
import { trackEventInBackground } from '../tracking'
import { getSuggestionImageObject } from './suggestion-images'
import { uploadPublicImage } from './public-image-storage'

/**
 * Apply an accepted/approved report to the people_groups data. Shared by the
 * admin single-review accept flow and the public two-approver apply flow.
 * Callers enforce status/permission rules; this performs the write.
 *
 * Activity logs use the "Report Update" source, which the IMB sync tooling
 * treats as a manual edit — applied suggestions survive future IMB updates.
 */
export async function applyReport(
  reportId: number,
  userId: string,
  event?: H3Event
): Promise<{ report: PeopleGroupReportWithDetails | null; peopleGroup: PeopleGroup | null }> {
  const report = await peopleGroupReportService.getById(reportId)
  if (!report) {
    throw createError({ statusCode: 404, statusMessage: 'Report not found' })
  }

  // A suggested picture (private bucket) goes public only now, at apply time.
  let suggestedImageUrl: string | null = null
  if (report.suggested_image_key) {
    const obj = await getSuggestionImageObject(report.suggested_image_key)
    if (obj) {
      const uploaded = await uploadPublicImage(obj.data)
      suggestedImageUrl = uploaded.url
    }
  }

  if (report.type === 'add') {
    return applyAdd(report, userId, suggestedImageUrl, event)
  }
  return applyUpdateOrRemove(report, userId, suggestedImageUrl, event)
}

function splitChanges(changes: Record<string, any>): { columns: Record<string, any>; metadata: Record<string, any> } {
  const columns: Record<string, any> = {}
  const metadata: Record<string, any> = {}
  for (const [key, value] of Object.entries(changes)) {
    if (isTableColumn(key)) columns[key] = value
    else metadata[key] = value
  }
  return { columns, metadata }
}

async function applyAdd(
  report: PeopleGroupReportWithDetails,
  userId: string,
  suggestedImageUrl: string | null,
  event?: H3Event
): Promise<{ report: PeopleGroupReportWithDetails | null; peopleGroup: PeopleGroup | null }> {
  const name = String(report.suggested_changes.name || report.people_group_name || '').trim()
  if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'The report has no people group name to create from' })
  }
  if (report.people_group_id) {
    throw createError({ statusCode: 400, statusMessage: 'This report is already linked to an existing people group' })
  }

  const { columns, metadata } = splitChanges(report.suggested_changes)
  const slug = await peopleGroupService.generateUniqueSlug(name)

  const created = await peopleGroupService.createPeopleGroup({
    name,
    slug,
    image_url: suggestedImageUrl,
    metadata: Object.keys(metadata).length > 0 ? metadata : null,
    country_code: columns.country_code ?? null,
    latitude: columns.latitude ?? null,
    longitude: columns.longitude ?? null,
    population: columns.population ?? null,
    status: 'active',
    engagement_status: columns.engagement_status ?? 'unengaged',
    primary_religion: columns.primary_religion ?? null,
    primary_language: columns.primary_language ?? null,
    joshua_project_id: columns.joshua_project_id ?? null
  })

  await peopleGroupReportService.link(report.id, created.id)
  await peopleGroupReportService.updateStatus(report.id, 'accepted', userId, { previousValues: {} })

  logCreate('people_groups', String(created.id), userId, {
    badge: 'Report Update',
    source: report.reporter_name,
    link_url: `/admin/people-groups/reports?id=${report.id}`,
    link_text: 'View Report'
  })
  logUpdate('people_group_reports', String(report.id), event ?? userId, {
    changes: { status: { from: report.status, to: 'accepted' } }
  })

  return {
    report: await peopleGroupReportService.getById(report.id),
    peopleGroup: created
  }
}

async function applyUpdateOrRemove(
  report: PeopleGroupReportWithDetails,
  userId: string,
  suggestedImageUrl: string | null,
  event?: H3Event
): Promise<{ report: PeopleGroupReportWithDetails | null; peopleGroup: PeopleGroup | null }> {
  if (!report.people_group_id) {
    throw createError({ statusCode: 400, statusMessage: 'Link this report to a people group before accepting.' })
  }
  const peopleGroup = await peopleGroupService.getPeopleGroupById(report.people_group_id)
  if (!peopleGroup) {
    throw createError({ statusCode: 404, statusMessage: 'People group not found' })
  }

  const effectiveChanges: Record<string, any> = { ...report.suggested_changes }
  if (suggestedImageUrl) effectiveChanges.image_url = suggestedImageUrl

  if (report.type === 'remove') {
    // A removal archives the group (with its reason) after applying any
    // corrected field values submitted alongside.
    effectiveChanges.status = 'archived'
  }

  // A public engagement report applied without an explicit reason records
  // doxa_report — the change was verified through Doxa's own review.
  if (
    report.source === 'public' &&
    effectiveChanges.engagement_status === 'engaged' &&
    peopleGroup.engagement_status !== 'engaged' &&
    !effectiveChanges.reason_engaged
  ) {
    effectiveChanges.reason_engaged = 'doxa_report'
  }

  const { columns, metadata } = splitChanges(effectiveChanges)
  const updateData: UpdatePeopleGroupData = { ...columns }
  if (Object.keys(metadata).length > 0) {
    updateData.metadata = metadata
    updateData.mergeMetadata = true
  }

  const updated = await peopleGroupService.updatePeopleGroup(report.people_group_id, updateData)

  const wasEngaged = peopleGroup.status === 'engaged' || peopleGroup.engagement_status === 'engaged'
  const isEngaged = updated?.status === 'engaged' || updated?.engagement_status === 'engaged'
  if (!wasEngaged && isEngaged && event) {
    trackEventInBackground(event, {
      eventType: 'people_group_engaged',
      metadata: {
        people_group_slug: updated?.slug || report.people_group_slug,
        people_group_id: report.people_group_id,
        report_id: report.id
      }
    })
  }

  // Snapshot previous values and track changes
  const previousValues: Record<string, any> = {}
  const changes: Record<string, { from: any; to: any }> = {}
  const oldMeta: Record<string, any> = peopleGroup.metadata || {}
  for (const [key, value] of Object.entries(effectiveChanges)) {
    const oldValue = isTableColumn(key) ? (peopleGroup as any)[key] : oldMeta[key]
    previousValues[key] = oldValue ?? null
    if (String(oldValue ?? '') !== String(value ?? '')) {
      changes[key] = { from: oldValue ?? null, to: value }
    }
  }
  if (Object.keys(changes).length > 0) {
    logUpdate('people_groups', String(report.people_group_id), undefined, {
      badge: 'Report Update',
      source: report.reporter_name,
      link_url: `/admin/people-groups/reports?id=${report.id}`,
      link_text: 'View Report',
      changes
    })
  }

  await peopleGroupReportService.updateStatus(report.id, 'accepted', userId, { previousValues })

  logUpdate('people_group_reports', String(report.id), event ?? userId, {
    changes: { status: { from: report.status, to: 'accepted' } }
  })

  return {
    report: await peopleGroupReportService.getById(report.id),
    peopleGroup: updated
      ? { ...updated, metadata: updated.metadata || {}, descriptions: updated.descriptions || {} }
      : null
  }
}
