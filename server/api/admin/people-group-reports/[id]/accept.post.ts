import { peopleGroupReportService } from '../../../../database/people-group-reports'
import { peopleGroupService } from '../../../../database/people-groups'
import { getIntParam } from '#server/utils/api-helpers'
import { isTableColumn } from '~/utils/people-group-fields'
import type { UpdatePeopleGroupData } from '#server/database/people-groups'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'people_groups.edit')

  const id = getIntParam(event, 'id')
  const report = await peopleGroupReportService.getById(id)

  if (!report) {
    throw createError({ statusCode: 404, statusMessage: 'Report not found' })
  }
  if (report.status !== 'pending') {
    throw createError({ statusCode: 400, statusMessage: 'Only pending reports can be accepted' })
  }

  const body = await readBody<{ notes?: string }>(event) || {}

  const peopleGroup = await peopleGroupService.getPeopleGroupById(report.people_group_id)
  if (!peopleGroup) {
    throw createError({ statusCode: 404, statusMessage: 'People group not found' })
  }

  // Split suggested_changes into table column fields vs metadata
  const updateData: UpdatePeopleGroupData = {}
  const metadataUpdates: Record<string, any> = {}

  for (const [key, value] of Object.entries(report.suggested_changes)) {
    if (isTableColumn(key)) {
      ;(updateData as any)[key] = value
    } else {
      metadataUpdates[key] = value
    }
  }

  if (Object.keys(metadataUpdates).length > 0) {
    updateData.metadata = metadataUpdates
    updateData.mergeMetadata = true
  }

  // Apply changes to the people group
  const updated = await peopleGroupService.updatePeopleGroup(report.people_group_id, updateData)

  // Snapshot previous values and track changes
  const previousValues: Record<string, any> = {}
  const changes: Record<string, { from: any; to: any }> = {}
  const oldMeta: Record<string, any> = peopleGroup.metadata || {}
  for (const [key, value] of Object.entries(report.suggested_changes)) {
    const oldValue = isTableColumn(key)
      ? (peopleGroup as any)[key]
      : oldMeta[key]
    previousValues[key] = oldValue ?? null
    if (String(oldValue ?? '') !== String(value ?? '')) {
      changes[key] = { from: oldValue ?? null, to: value }
    }
  }
  if (Object.keys(changes).length > 0) {
    logUpdate('people_groups', String(report.people_group_id), undefined, {
      badge: 'Report Update',
      source: report.reporter_name,
      link_url: `/admin/people-groups/reports?id=${id}`,
      link_text: 'View Report',
      changes
    })
  }

  // Mark the report as accepted with previous values snapshot
  await peopleGroupReportService.updateStatus(id, 'accepted', user.userId, { previousValues })

  logUpdate('people_group_reports', String(id), event, {
    changes: { status: { from: 'pending', to: 'accepted' } }
  })

  return {
    report: await peopleGroupReportService.getById(id),
    peopleGroup: updated ? {
      ...updated,
      metadata: updated.metadata || {},
      descriptions: updated.descriptions || {}
    } : null
  }
})
