import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { getTestDatabase, closeTestDatabase, cleanupTestData, createTestPeopleGroup } from '../../../helpers/db'
import { createAdminUser, createEditorUser } from '../../../helpers/auth'

// The test environment's FormData is not the one the HTTP client serialises,
// so the multipart body is written by hand.
function csvUpload(
  csv: string,
  mapping: Record<string, string>,
  dryRun: boolean,
  auth: { headers: { cookie: string } }
): { body: string; headers: Record<string, string> } {
  const boundary = `----vitest${Date.now()}`
  const fields: Record<string, string> = { mapping: JSON.stringify(mapping), dry_run: String(dryRun) }

  let body = ''
  for (const [name, value] of Object.entries(fields)) {
    body += `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
  }
  body += `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="partners.csv"\r\nContent-Type: text/csv\r\n\r\n${csv}\r\n--${boundary}--\r\n`

  return {
    body,
    headers: { ...auth.headers, 'content-type': `multipart/form-data; boundary=${boundary}` }
  }
}

describe('People group CSV import API', async () => {
  const sql = getTestDatabase()

  let adminAuth: { headers: { cookie: string } }
  let editorAuth: { headers: { cookie: string } }
  let engagedTarget: { id: number }
  let untouched: { id: number }

  const mapping = {
    'IMB PEID': 'imb_peid',
    'Name': '__name_check__',
    'Engagement Status': 'engagement_status',
    'Verified By': 'engagement_verified_by',
    'Baptisms': 'baptisms_count',
    'Review Note': '__comment__'
  }

  const csv = [
    'IMB PEID,Name,Engagement Status,Verified By,Baptisms,Review Note',
    '"TESTPEID-IMP1","Test Import One","engaged","IMA, Mission India","1,200","ignored"',
    '"TESTPEID-IMP2","Test Import Two","unengaged","","",""',
    '"TESTPEID-IMP404","Missing","engaged","","",""'
  ].join('\n')

  beforeAll(async () => {
    await cleanupTestData(sql)
    adminAuth = (await createAdminUser(sql)).auth
    editorAuth = (await createEditorUser(sql)).auth
    engagedTarget = await createTestPeopleGroup(sql, { title: 'Test Import One' }) as any
    untouched = await createTestPeopleGroup(sql, { title: 'Test Import Two' }) as any
    await sql`UPDATE people_groups SET engagement_status = 'unengaged', metadata = jsonb_build_object('imb_peid', 'TESTPEID-IMP1') WHERE id = ${engagedTarget.id}`
    await sql`UPDATE people_groups SET engagement_status = 'unengaged', metadata = jsonb_build_object('imb_peid', 'TESTPEID-IMP2') WHERE id = ${untouched.id}`
  })

  afterAll(async () => {
    await sql`DELETE FROM activity_logs WHERE table_name = 'people_groups' AND record_id IN (${String(engagedTarget.id)}, ${String(untouched.id)})`
    await sql`DELETE FROM comments WHERE record_type = 'people_group' AND record_id IN (${engagedTarget.id}, ${untouched.id})`
    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  it('returns 403 for people group editors, whose edit permission is scoped', async () => {
    const error = await $fetch('/api/admin/people-groups/import', {
      method: 'POST',
      ...csvUpload(csv, mapping, true, editorAuth)
    }).catch((e) => e)
    expect(error.statusCode).toBe(403)
  })

  it('requires a column mapped to the PEID', async () => {
    const error = await $fetch('/api/admin/people-groups/import', {
      method: 'POST',
      ...csvUpload(csv, { Baptisms: 'baptisms_count' }, true, adminAuth)
    }).catch((e) => e)
    expect(error.statusCode).toBe(400)
    expect(error.data?.statusMessage).toContain('PEID')
  })

  it('previews without writing', async () => {
    const plan: any = await $fetch('/api/admin/people-groups/import', {
      method: 'POST',
      ...csvUpload(csv, mapping, true, adminAuth)
    })
    expect(plan.dry_run).toBe(true)
    expect(plan.matched).toBe(2)
    expect(plan.unchanged).toBe(1)
    expect(plan.errors).toHaveLength(1)
    expect(plan.rows).toHaveLength(1)
    expect(plan.rows[0].people_group_id).toBe(engagedTarget.id)

    const [row] = await sql`SELECT engagement_status FROM people_groups WHERE id = ${engagedTarget.id}`
    expect(row!.engagement_status).toBe('unengaged')
  })

  it('applies the changes and logs them as a CSV import', async () => {
    const result: any = await $fetch('/api/admin/people-groups/import', {
      method: 'POST',
      ...csvUpload(csv, mapping, false, adminAuth)
    })
    expect(result.updated).toBe(1)
    expect(result.failed).toEqual([])

    const [row] = await sql`SELECT engagement_status, metadata FROM people_groups WHERE id = ${engagedTarget.id}`
    expect(row!.engagement_status).toBe('engaged')
    expect(row!.metadata.imb_peid).toBe('TESTPEID-IMP1')
    expect(row!.metadata.engagement_verified_by).toBe('IMA, Mission India')
    expect(row!.metadata.baptisms_count).toBe(1200)
    expect(row!.metadata.reason_engaged).toBe('partner_report')

    await new Promise(resolve => setTimeout(resolve, 500))
    const logs = await sql`
      SELECT metadata FROM activity_logs
      WHERE table_name = 'people_groups' AND record_id = ${String(engagedTarget.id)}
    `
    expect(logs).toHaveLength(1)
    expect(logs[0]!.metadata.badge).toBe('CSV Import')
    expect(Object.keys(logs[0]!.metadata.changes).sort()).toEqual(
      ['baptisms_count', 'engagement_status', 'engagement_verified_by', 'reason_engaged']
    )

    const comments = await sql`SELECT content FROM comments WHERE record_type = 'people_group' AND record_id = ${engagedTarget.id}`
    expect(comments).toHaveLength(1)
    expect(comments[0]!.content.content[0].content[0].text).toBe('Review Note: ignored')
  })

  it('does not repeat changes or comments when the same file is imported again', async () => {
    const plan: any = await $fetch('/api/admin/people-groups/import', {
      method: 'POST',
      ...csvUpload(csv, mapping, true, adminAuth)
    })
    expect(plan.rows).toEqual([])
    expect(plan.unchanged).toBe(2)
  })

  it('keeps the verifiers out of the public detail API', async () => {
    const [pg] = await sql`SELECT slug FROM people_groups WHERE id = ${engagedTarget.id}`
    const detail: any = await $fetch(`/api/people-groups/detail/${pg!.slug}`)
    const flat = JSON.stringify(detail)
    expect(flat).not.toContain('Mission India')
    const list: any = await $fetch('/api/people-groups/list?fields=slug,engagement_verified_by')
    expect(JSON.stringify(list)).not.toContain('Mission India')
  })
})
