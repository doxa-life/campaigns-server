import { handleApiError } from '#server/utils/api-helpers'

const TABLE_PERMISSIONS: Record<string, string> = {
  people_groups: 'people_groups.view',
  groups: 'groups.view',
  subscribers: 'subscribers.view',
  libraries: 'content.view',
  people_group_adoptions: 'groups.view',
  users: 'users.manage'
}

export default defineEventHandler(async (event) => {
  const tableName = getRouterParam(event, 'tableName')
  const recordId = getRouterParam(event, 'recordId')

  if (!tableName || !TABLE_PERMISSIONS[tableName]) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid table name' })
  }

  if (!recordId) {
    throw createError({ statusCode: 400, statusMessage: 'Record ID is required' })
  }

  await requirePermission(event, TABLE_PERMISSIONS[tableName])

  try {
    const activities = await sql`
      SELECT
        al.id,
        al.timestamp,
        al.event_type,
        al.table_name,
        al.user_id,
        al.metadata,
        u.display_name as user_name
      FROM activity_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE al.table_name = ${tableName} AND al.record_id = ${recordId}
      ORDER BY al.timestamp DESC
      LIMIT 100
    `

    const formattedActivities = activities.map((a: any) => ({
      id: a.id,
      timestamp: typeof a.timestamp === 'string' ? parseInt(a.timestamp, 10) : a.timestamp,
      eventType: a.event_type,
      tableName: a.table_name,
      userId: a.user_id,
      userName: a.user_name,
      metadata: typeof a.metadata === 'string' ? JSON.parse(a.metadata) : a.metadata
    }))

    return { activities: formattedActivities }
  } catch (error) {
    handleApiError(error, 'Failed to fetch activity logs')
  }
})
