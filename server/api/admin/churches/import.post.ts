import { churchService, type Church, type ChurchData } from '../../../database/churches'
import { normalizeChurchInput, normalizeCountry, initialLocationStatus, type ChurchInput } from '../../../utils/app/church-input'
import { kickChurchGeocoding } from '../../../utils/app/church-geocoder'
import { parseCsv } from '#shared/csv'
import { getChurchField } from '#shared/churches'

interface ImportRowError {
  row: number
  message: string
}

const MAX_ROWS = 10_000
const INSERT_CHUNK = 500

/**
 * Multipart CSV import. `mapping` pairs CSV headers with church field keys;
 * headers left out of it are ignored. `default_country` fills rows whose
 * country is not mapped or blank. Every valid row inserts, no duplicate
 * check; rows without a name are reported and skipped. Row numbers count
 * the header as line 1, matching the spreadsheet.
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'churches.create')

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
  const mappedFields = Object.values(mapping).filter(Boolean)
  if (!mappedFields.includes('name')) {
    throw createError({ statusCode: 400, statusMessage: 'A column must be mapped to the church name' })
  }
  for (const key of mappedFields) {
    if (!getChurchField(key)) {
      throw createError({ statusCode: 400, statusMessage: `Unknown field: ${key}` })
    }
  }

  const defaultCountry = normalizeCountry(formData!.find(f => f.name === 'default_country')?.data.toString('utf-8'))
  if (defaultCountry === undefined) {
    throw createError({ statusCode: 400, statusMessage: 'Default country is not recognised' })
  }

  const rows = parseCsv(file.data.toString('utf-8'))
  if (rows.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'The CSV has no data rows' })
  }
  if (rows.length > MAX_ROWS) {
    throw createError({ statusCode: 400, statusMessage: `The CSV has more than ${MAX_ROWS} rows` })
  }

  const errors: ImportRowError[] = []
  const toInsert: ChurchData[] = []

  rows.forEach((row, index) => {
    const input: ChurchInput = { name: null }
    for (const [header, field] of Object.entries(mapping)) {
      if (field) (input as Record<string, unknown>)[field] = row[header] ?? null
    }
    if (defaultCountry && !('country' in input && input.country)) input.country = defaultCountry

    const { data, errors: rowErrors } = normalizeChurchInput(input)
    if (rowErrors.length > 0) {
      errors.push({ row: index + 2, message: rowErrors.join('; ') })
      return
    }
    toInsert.push({ ...data, name: data.name!, location_status: initialLocationStatus(data) })
  })

  const created: Church[] = []
  for (let i = 0; i < toInsert.length; i += INSERT_CHUNK) {
    created.push(...await churchService.createMany(toInsert.slice(i, i + INSERT_CHUNK)))
  }
  for (const church of created) {
    logCreate('churches', String(church.id), event, { import: true })
  }
  const queued = created.filter(c => c.location_status === 'pending').length
  if (queued > 0) kickChurchGeocoding()

  return {
    total: rows.length,
    imported: created.length,
    queued,
    skipped: errors.length,
    errors: errors.slice(0, 200)
  }
})
