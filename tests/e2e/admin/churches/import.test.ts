import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { getTestDatabase, closeTestDatabase, cleanupTestData } from '../../../helpers/db'
import { createAdminUser, createEditorUser } from '../../../helpers/auth'

// The test environment's FormData is not the one the HTTP client serialises,
// so the multipart body is written by hand.
function csvUpload(
  csv: string,
  mapping: Record<string, string>,
  defaultCountry: string | undefined,
  auth: { headers: { cookie: string } }
): { body: string; headers: Record<string, string> } {
  const boundary = `----vitest${Date.now()}`
  const fields: Record<string, string> = { mapping: JSON.stringify(mapping) }
  if (defaultCountry) fields.default_country = defaultCountry

  let body = ''
  for (const [name, value] of Object.entries(fields)) {
    body += `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
  }
  body += `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="churches.csv"\r\nContent-Type: text/csv\r\n\r\n${csv}\r\n--${boundary}--\r\n`

  return {
    body,
    headers: { ...auth.headers, 'content-type': `multipart/form-data; boundary=${boundary}` }
  }
}

describe('Church CSV import API', async () => {
  const sql = getTestDatabase()

  let adminAuth: { headers: { cookie: string } }
  let editorAuth: { headers: { cookie: string } }

  beforeAll(async () => {
    await cleanupTestData(sql)
    adminAuth = (await createAdminUser(sql)).auth
    editorAuth = (await createEditorUser(sql)).auth
  })

  afterAll(async () => {
    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  it('returns 403 for users without churches.create', async () => {
    const error = await $fetch('/api/admin/churches/import', {
      method: 'POST',
      ...csvUpload('Church\nTest Church X', { Church: 'name' }, undefined, editorAuth)
    }).catch((e) => e)
    expect(error.statusCode).toBe(403)
  })

  it('requires a column mapped to the name', async () => {
    const error = await $fetch('/api/admin/churches/import', {
      method: 'POST',
      ...csvUpload('Town\nSomewhere', { Town: 'town' }, undefined, adminAuth)
    }).catch((e) => e)
    expect(error.statusCode).toBe(400)
    expect(error.data?.statusMessage).toContain('church name')
  })

  it('imports mapped columns, applies the default country and reports skipped rows', async () => {
    const csv = [
      'Church,Village,Pastor,Phone,Size,Language,Country,Notes',
      '"Test Church Import One","Rangpur","Test Pastor A","+880 1700","about 60","Bengali",,"ignored"',
      '"Test Church Import Two","Dinajpur","Test Pastor B","","40-50","Santali","India",""',
      '"","Nowhere","Test Pastor C","","10","",,""',
      '"Test Church Import Four","","","","","",,""'
    ].join('\n')

    const response = await $fetch('/api/admin/churches/import', {
      method: 'POST',
      ...csvUpload(csv, {
        Church: 'name',
        Village: 'town',
        Pastor: 'pastor_name',
        Phone: 'pastor_phone',
        Size: 'congregation_size',
        Language: 'service_language',
        Country: 'country'
      }, 'BD', adminAuth)
    })

    expect(response.total).toBe(4)
    expect(response.imported).toBe(3)
    expect(response.queued).toBe(2)
    expect(response.skipped).toBe(1)
    expect(response.errors).toEqual([{ row: 4, message: 'Name is required' }])

    const rows = await sql`SELECT * FROM churches WHERE name LIKE 'Test Church Import %' ORDER BY name`
    const byName = Object.fromEntries(rows.map(r => [r.name, r]))

    expect(byName['Test Church Import One'].town).toBe('Rangpur')
    expect(byName['Test Church Import One'].country).toBe('BD')
    expect(byName['Test Church Import One'].congregation_size).toBe(60)
    expect(byName['Test Church Import One'].pastor_phone).toBe('+880 1700')
    expect(byName['Test Church Import One'].location_status).toBe('pending')

    expect(byName['Test Church Import Two'].country).toBe('IN')
    expect(byName['Test Church Import Two'].congregation_size).toBe(40)
    expect(byName['Test Church Import Two'].service_language).toBe('Santali')

    expect(byName['Test Church Import Four'].town).toBeNull()
    expect(byName['Test Church Import Four'].country).toBe('BD')
    expect(byName['Test Church Import Four'].location_status).toBeNull()
  })

  it('inserts duplicates rather than merging them', async () => {
    const csv = 'Church,Village\nTest Church Twice,Rangpur\nTest Church Twice,Rangpur'
    const response = await $fetch('/api/admin/churches/import', {
      method: 'POST',
      ...csvUpload(csv, { Church: 'name', Village: 'town' }, undefined, adminAuth)
    })
    expect(response.imported).toBe(2)
    expect(response.queued).toBe(0)
    const rows = await sql`SELECT id FROM churches WHERE name = 'Test Church Twice'`
    expect(rows).toHaveLength(2)
  })
})
