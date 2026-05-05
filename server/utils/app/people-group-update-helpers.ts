import { tableColumnFields } from '~/utils/people-group-fields'
import type { UpdatePeopleGroupData } from '#server/database/people-groups'

/**
 * Extract table column fields from a request body into UpdatePeopleGroupData.
 * Uses tableColumnFields as the allowlist — new fields with tableColumn: true
 * are picked up automatically.
 */
export function extractUpdateFields(body: Record<string, any>): {
  updateData: UpdatePeopleGroupData
  hasFields: boolean
} {
  const updateData: UpdatePeopleGroupData = {}
  let hasFields = false

  for (const field of tableColumnFields) {
    if (body[field.key] !== undefined) {
      ;(updateData as any)[field.key] = body[field.key]
      hasFields = true
    }
  }

  if (body.metadata !== undefined) {
    updateData.metadata = body.metadata
    hasFields = true
  }

  if (body.tags !== undefined) {
    updateData.tags = body.tags
    hasFields = true
  }

  return { updateData, hasFields }
}
