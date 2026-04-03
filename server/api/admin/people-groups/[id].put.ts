import { peopleGroupService } from '../../../database/people-groups'
import { getIntParam } from '#server/utils/api-helpers'
import { extractUpdateFields } from '#server/utils/app/people-group-update-helpers'
import { tableColumnFields } from '~/utils/people-group-fields'

const tableColumnKeys = tableColumnFields.map(f => f.key)
const tableColumnKeySet = new Set(tableColumnKeys)

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'people_groups.edit')

  const id = getIntParam(event, 'id')

  const oldRecord = await peopleGroupService.getPeopleGroupById(id)
  if (!oldRecord) {
    throw createError({ statusCode: 404, statusMessage: 'People group not found' })
  }

  const body = await readBody(event) as Record<string, any>
  const { updateData } = extractUpdateFields(body)

  const updated = await peopleGroupService.updatePeopleGroup(id, updateData)

  if (!updated) {
    throw createError({
      statusCode: 404,
      statusMessage: 'People group not found'
    })
  }

  // Track field-level changes
  const changes: Record<string, { from: any; to: any }> = {}
  for (const key of tableColumnKeys) {
    if (body[key] !== undefined && String(body[key] ?? '') !== String((oldRecord as any)[key] ?? '')) {
      changes[key] = { from: (oldRecord as any)[key], to: body[key] }
    }
  }
  if (body.metadata !== undefined) {
    const oldMeta: Record<string, any> = oldRecord.metadata || {}
    const newMeta = body.metadata || {}
    const allKeys = new Set([...Object.keys(oldMeta), ...Object.keys(newMeta)])
    for (const key of allKeys) {
      if (tableColumnKeySet.has(key)) continue
      if (String(oldMeta[key] ?? '') !== String(newMeta[key] ?? '')) {
        changes[key] = { from: oldMeta[key] ?? null, to: newMeta[key] ?? null }
      }
    }
  }
  if (body.descriptions !== undefined) {
    const oldDescs: Record<string, string> = oldRecord.descriptions || {}
    const newDescs = body.descriptions || {}
    const descKeys = new Set([...Object.keys(oldDescs), ...Object.keys(newDescs)])
    for (const lang of descKeys) {
      if ((oldDescs[lang] ?? '') !== (newDescs[lang] ?? '')) {
        changes[`description_${lang}`] = { from: oldDescs[lang] ?? null, to: newDescs[lang] ?? null }
      }
    }
  }
  if (Object.keys(changes).length > 0) {
    logUpdate('people_groups', String(id), event, { changes })
  }

  return {
    peopleGroup: {
      ...updated,
      metadata: updated.metadata || {},
      descriptions: updated.descriptions || {}
    }
  }
})
