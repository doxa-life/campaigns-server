import { allFields, getField, categories } from '../../../../app/utils/people-group-fields'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'people_groups.view')

  const query = getQuery(event)
  const fieldKey = query.field as string | undefined

  if (fieldKey) {
    // Return options for a specific field
    const field = getField(fieldKey)
    if (!field) {
      return { options: [] }
    }

    // If the field uses dynamic options source, indicate that
    if (field.optionsSource) {
      return {
        optionsSource: field.optionsSource,
        options: []
      }
    }

    // Return static options with labelKeys for client-side translation
    const options = field.options?.map(opt => ({
      value: opt.value,
      labelKey: opt.labelKey
    })) || []

    return { options }
  }

  // Return all field definitions and categories
  const fieldsByCategory: Record<string, typeof allFields> = {}

  for (const field of allFields) {
    if (!fieldsByCategory[field.category]) {
      fieldsByCategory[field.category] = []
    }
    fieldsByCategory[field.category]!.push(field)
  }

  return {
    categories,
    fieldsByCategory,
    fields: allFields
  }
})
