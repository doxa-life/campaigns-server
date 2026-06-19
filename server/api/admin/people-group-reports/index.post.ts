import { peopleGroupReportService } from '../../../database/people-group-reports'
import { peopleGroupService } from '../../../database/people-groups'
import { commentService } from '../../../database/comments'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'people_groups.edit')

  const body = await readBody<{
    people_group_id?: number
    people_group_name?: string
    people_group_uid?: string
    reporter_name: string
    reporter_email?: string
    suggested_changes: Record<string, any>
    notes?: string
    ai_input_text?: string
  }>(event)

  const peopleGroupName = body.people_group_name?.trim() || null

  if (!body.people_group_id && !peopleGroupName) {
    throw createError({ statusCode: 400, statusMessage: 'Select a people group or enter a name' })
  }
  if (!body.reporter_name?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Reporter name is required' })
  }
  const hasChanges = body.suggested_changes && Object.keys(body.suggested_changes).length > 0
  if (!hasChanges && !body.notes?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Add at least one field change or a note' })
  }

  // A linked report must reference a real people group; an unlinked report
  // stores the reported name/identifier for linking later.
  if (body.people_group_id) {
    const peopleGroup = await peopleGroupService.getPeopleGroupById(body.people_group_id)
    if (!peopleGroup) {
      throw createError({ statusCode: 404, statusMessage: 'People group not found' })
    }
  }

  const report = await peopleGroupReportService.create({
    people_group_id: body.people_group_id || null,
    people_group_name: body.people_group_id ? null : peopleGroupName,
    people_group_uid: body.people_group_id ? null : (body.people_group_uid?.trim() || null),
    reporter_name: body.reporter_name.trim(),
    reporter_email: body.reporter_email?.trim() || null,
    suggested_changes: body.suggested_changes || {},
    notes: body.notes?.trim() || null
  })

  logCreate('people_group_reports', String(report.id), event)

  if (body.ai_input_text?.trim()) {
    const paragraphs = body.ai_input_text.split('\n').map(line => ({
      type: 'paragraph' as const,
      ...(line.trim() ? { content: [{ type: 'text' as const, text: line }] } : {})
    }))
    try {
      await commentService.create({
        record_type: 'people_group_report',
        record_id: report.id,
        user_id: null,
        author_label: 'AI Report Input',
        content: { type: 'doc', content: paragraphs }
      })
    } catch (err) {
      console.warn('Failed to save AI input as comment:', err)
    }
  }

  return { report }
})
