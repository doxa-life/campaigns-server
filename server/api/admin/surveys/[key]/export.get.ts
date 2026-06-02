import { surveyService } from '#server/database/surveys'

function csvEscape(value: unknown): string {
  let str = value == null ? '' : String(value)
  // Neutralize CSV formula injection: a leading =, +, -, @, tab, or CR can be
  // executed as a formula by Excel/Sheets. Free-text answers are user-supplied.
  if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'marketing.view')

  const key = getRouterParam(event, 'key')
  if (!key) {
    throw createError({ statusCode: 400, statusMessage: 'Missing survey key' })
  }

  const survey = await surveyService.getByKey(key)
  if (!survey) {
    throw createError({ statusCode: 404, statusMessage: 'Survey not found' })
  }

  const rows = await surveyService.getResponsesForExport(survey.id)
  const headers = rows.length > 0
    ? Object.keys(rows[0]!)
    : ['profile_id', 'submitted_at', 'updated_at', 'preferred_language', 'people_groups']

  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map(h => csvEscape((row as Record<string, unknown>)[h])).join(','))
  }

  setHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
  setHeader(event, 'Content-Disposition', `attachment; filename="${key}-responses.csv"`)
  return lines.join('\n')
})
