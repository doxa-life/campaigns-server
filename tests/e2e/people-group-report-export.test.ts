import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { fetch as rawFetch } from '@nuxt/test-utils/e2e'
import { v4 as uuidv4 } from 'uuid'
import { getTestDatabase, closeTestDatabase, cleanupTestData } from '../helpers/db'
import { createAdminUser, createNoRoleUser, type TestUser, type AuthHeaders } from '../helpers/auth'

// Minimal RFC 4180 parser: quoted fields may hold commas, quotes and newlines.
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else field += c
  }
  row.push(field)
  rows.push(row)
  return rows
}

describe('People Group Reports CSV export', async () => {
  const sql = getTestDatabase()

  let admin: { user: TestUser; auth: AuthHeaders }
  let noRole: { user: TestUser; auth: AuthHeaders }
  let groupId: number
  let pendingId: number
  let deniedId: number
  let addId: number

  beforeAll(async () => {
    await cleanupTestData(sql)
    admin = await createAdminUser(sql)
    noRole = await createNoRoleUser(sql)

    const [group] = await sql`
      INSERT INTO people_groups (name, slug, population, status, engagement_status, metadata)
      VALUES ('Test Export Group', ${'test-export-group-' + uuidv4().slice(0, 8)}, 1000, 'active', 'unengaged', ${sql.json({ imb_pgid: '12345' })})
      RETURNING id
    `
    groupId = group!.id

    const [pending] = await sql`
      INSERT INTO people_group_reports (
        people_group_id, type, source, status, reporter_name, reporter_email, reporter_org,
        verifier_name, verifier_entity, verifier_email, suggested_changes, notes
      )
      VALUES (
        ${groupId}, 'update', 'public', 'pending', 'Export Reporter', 'reporter@example.com', 'Field Org',
        'Export Verifier', 'Verifier Org', 'verifier@example.com',
        ${sql.json({ population: 2500, engagement_status: 'unengaged' })}, 'Seen firsthand, "recent" census'
      )
      RETURNING id
    `
    pendingId = pending!.id

    const [denied] = await sql`
      INSERT INTO people_group_reports (
        people_group_id, type, source, status, reporter_name, suggested_changes,
        previous_values, reviewed_by, reviewed_at
      )
      VALUES (
        ${groupId}, 'update', 'admin', 'denied', 'Other Reporter', ${sql.json({ population: 900 })},
        ${sql.json({ population: 800 })}, ${admin.user.id}, NOW()
      )
      RETURNING id
    `
    deniedId = denied!.id

    const [add] = await sql`
      INSERT INTO people_group_reports (
        people_group_name, type, source, status, reporter_name, suggested_changes, add_fields
      )
      VALUES (
        'Test Export New Group', 'add', 'public', 'pending', 'Add Reporter', ${sql.json({ population: 3000, primary_religion: 'ANI' })},
        ${sql.json({ values: {
          primary_religion: 'MSN',
          description_en: 'a community of farmers',
          picture_credit: [{ text: 'Photo courtesy of ', link: null }, { text: 'Joshua Project', link: 'https://www.joshuaproject.net' }]
        } })}
      )
      RETURNING id
    `
    addId = add!.id

    await sql`
      INSERT INTO comments (record_type, record_id, user_id, content)
      VALUES ('people_group_report', ${pendingId}, ${admin.user.id},
        ${sql.json({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Checked with the verifier' }] }] })})
    `
  })

  afterAll(async () => {
    await sql`DELETE FROM comments WHERE record_type = 'people_group_report' AND record_id IN (${pendingId}, ${deniedId}, ${addId})`
    await sql`DELETE FROM people_group_reports WHERE people_group_id = ${groupId} OR id = ${addId}`
    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  async function exportCsv(query = '', auth = admin.auth) {
    const res = await rawFetch(`/api/admin/people-group-reports/export-csv${query}`, auth)
    const text = await res.text()
    const [headers, ...rows] = parseCsv(text.replace(/^﻿/, ''))
    const records = rows.map(r => Object.fromEntries(headers!.map((h, i) => [h, r[i]])))
    return { res, records }
  }

  it('exports each report with its people, status, changes, notes and comments', async () => {
    const { res, records } = await exportCsv('?search=Export')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    expect(res.headers.get('content-disposition')).toContain('attachment')

    const pending = records.find(r => r.ID === String(pendingId))!
    expect(pending).toBeDefined()
    expect(pending.Status).toBe('pending')
    expect(pending.Source).toBe('public')
    expect(pending['People Group']).toBe('Test Export Group')
    expect(pending['Reporter Name']).toBe('Export Reporter')
    expect(pending['Reporter Email']).toBe('reporter@example.com')
    expect(pending['Reporter Organization']).toBe('Field Org')
    expect(pending['Verifier Name']).toBe('Export Verifier')
    expect(pending['Verifier Organization']).toBe('Verifier Org')
    expect(pending['Verifier Email']).toBe('verifier@example.com')
    expect(pending.Population).toBe('2,500')
    expect(Object.keys(pending)).not.toContain('Engagement Status')
    expect(pending.PGID).toBe('12345')
    expect(pending['Notes & Comments']).toContain('Export Reporter: Seen firsthand, "recent" census')
    expect(pending['Notes & Comments']).toContain('Checked with the verifier')
  })

  it('compares a resolved report against its snapshot', async () => {
    const { records } = await exportCsv('?status=denied&search=Test Export')
    expect(records.map(r => r.ID)).toEqual([String(deniedId)])
    expect(records[0]!.Population).toBe('900')
  })

  it('puts an add report\'s completion fields in their own columns', async () => {
    const { records } = await exportCsv('?search=Test Export New')
    const add = records.find(r => r.ID === String(addId))!
    expect(add.Population).toBe('3,000')
    expect(add['Primary Religion']).toBe('Islam - Sunni')
    expect(add.Description).toBe('a community of farmers')
    expect(add['Picture Credit']).toBe('Photo courtesy of Joshua Project')
    expect(Object.keys(add)).not.toContain('Completion Fields')
  })

  it('requires people group view permission', async () => {
    const { res } = await exportCsv('', noRole.auth)
    expect(res.status).toBe(403)
  })
})
