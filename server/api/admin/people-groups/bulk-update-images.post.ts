import { getDatabase } from '#server/database/db'

interface UpdateItem {
  id: number
  image_url: string
}

interface BulkUpdateBody {
  updates: UpdateItem[]
}

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const body = await readBody<BulkUpdateBody>(event)

  if (!Array.isArray(body?.updates) || body.updates.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'updates array is required and must not be empty' })
  }

  const db = getDatabase()
  let succeeded = 0
  let failed = 0
  const errors: { id: number; error: string }[] = []

  for (const item of body.updates) {
    if (typeof item.id !== 'number' || typeof item.image_url !== 'string') {
      failed++
      errors.push({ id: item.id, error: 'Invalid id or image_url' })
      continue
    }
    try {
      const stmt = db.prepare(`
        UPDATE people_groups
        SET image_url = ?, updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
        WHERE id = ?
      `)
      await stmt.run(item.image_url, item.id)
      succeeded++
    } catch (err: any) {
      failed++
      errors.push({ id: item.id, error: err.message ?? String(err) })
    }
  }

  return { succeeded, failed, errors }
})
