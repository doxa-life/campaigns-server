#!/usr/bin/env tsx
/**
 * Import DINL prayer fuel CSVs into people groups via the admin API.
 *
 * Reads people-groups/dinl/todo.csv for people group mappings, then for each row
 * where upload_done is empty, finds the matching prompts/{slug}.csv file and
 * imports 365 prayer prompts as a people group library.
 *
 * Usage:
 *   bun run scripts/import-dinl.ts --url http://localhost:3000 --key dxk_...
 *   bun run scripts/import-dinl.ts --url http://localhost:3000 --key dxk_... --limit 1
 *   bun run scripts/import-dinl.ts --url https://production.example.com --key dxk_... --dir ../people-groups/dinl
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
function parseArgs() {
  const args = process.argv.slice(2)
  const parsed: Record<string, string> = {}
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, '')
    const value = args[i + 1]
    if (key && value) parsed[key] = value
  }
  return parsed
}

const args = parseArgs()
const BASE_URL = (args.url || '').replace(/\/$/, '')
const API_KEY = args.key || ''
const DIR = args.dir || join(process.cwd(), '..', 'people-groups', 'dinl')
const LIMIT = parseInt(args.limit || '0', 10)
const TODO_PATH = join(DIR, 'todo.csv')
const PROMPTS_DIR = join(DIR, 'prompts')

if (!BASE_URL || !API_KEY) {
  console.error('Usage: bun run scripts/import-dinl.ts --url <base_url> --key <api_key> [--dir <csv_dir>]')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Todo CSV parsing
// ---------------------------------------------------------------------------
// name,slug,campaign_id,research_done,prompts_done,upload_done,country,religion,reviewed
interface TodoRow {
  name: string
  slug: string
  campaign_id: number
  research_done: string
  prompts_done: string
  upload_done: string
  country: string
  religion: string
  reviewed: string
}

function parseCsvLine(line: string): string[] {
  const parts: string[] = []
  let current = ''
  let inQuotes = false
  for (const char of line) {
    if (inQuotes) {
      if (char === '"') inQuotes = false
      else current += char
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      parts.push(current)
      current = ''
    } else if (char !== '\r') {
      current += char
    }
  }
  parts.push(current)
  return parts
}

function parseTodoCsv(text: string): TodoRow[] {
  const lines = text.split('\n').filter(l => l.trim())
  return lines.slice(1).map(line => {
    const p = parseCsvLine(line)
    return {
      name: (p[0] || '').trim(),
      slug: (p[1] || '').trim(),
      campaign_id: parseInt(p[2] || '0', 10),
      research_done: (p[3] || '').trim(),
      prompts_done: (p[4] || '').trim(),
      upload_done: (p[5] || '').trim(),
      country: (p[6] || '').trim(),
      religion: (p[7] || '').trim(),
      reviewed: (p[8] || '').trim(),
    }
  }).filter(r => r.name && r.campaign_id)
}

function writeTodoCsv(rows: TodoRow[]) {
  const header = 'name,slug,campaign_id,research_done,prompts_done,upload_done,country,religion,reviewed'
  const lines = rows.map(r => {
    const name = r.name.includes(',') ? `"${r.name}"` : r.name
    const religion = r.religion.includes(',') ? `"${r.religion}"` : r.religion
    return `${name},${r.slug},${r.campaign_id},${r.research_done},${r.prompts_done},${r.upload_done},${r.country},${religion},${r.reviewed}`
  })
  writeFileSync(TODO_PATH, [header, ...lines].join('\n') + '\n')
}

// ---------------------------------------------------------------------------
// Prayer prompt CSV parsing (single-column, one prompt per line)
// ---------------------------------------------------------------------------
function parsePromptCsv(text: string): string[] {
  const lines: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += char
      }
    } else if (char === '"' && current.trim() === '') {
      inQuotes = true
    } else if (char === '\n') {
      const trimmed = current.trim()
      if (trimmed) lines.push(trimmed)
      current = ''
    } else if (char !== '\r') {
      current += char
    }
  }
  const trimmed = current.trim()
  if (trimmed) lines.push(trimmed)

  return lines
}

// ---------------------------------------------------------------------------
// Tiptap JSON builder
// ---------------------------------------------------------------------------
function buildContentJson(prompt: string) {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: prompt }],
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------
function authHeaders(contentType?: string): Record<string, string> {
  const headers: Record<string, string> = { 'Authorization': `Bearer ${API_KEY}` }
  if (contentType) headers['Content-Type'] = contentType
  return headers
}

async function fetchSlugToIdMap(): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  const pageSize = 500
  let offset = 0
  let total = Infinity

  while (offset < total) {
    const res = await fetch(`${BASE_URL}/api/admin/people-groups?limit=${pageSize}&offset=${offset}`, {
      headers: authHeaders(),
    })
    if (!res.ok) throw new Error(`Failed to fetch people groups: HTTP ${res.status}`)
    const data = await res.json() as any
    total = data.total ?? 0
    for (const pg of data.peopleGroups || []) {
      if (pg.slug) map.set(pg.slug, pg.id)
    }
    offset += pageSize
  }

  return map
}

async function findExistingDayInLifeLibrary(peopleGroupId: number): Promise<number | null> {
  const res = await fetch(`${BASE_URL}/api/admin/people-groups/${peopleGroupId}/libraries`, {
    headers: authHeaders(),
  })
  if (!res.ok) return null
  const data = await res.json() as any
  const libs = data.libraries || []
  const existing = libs.find((l: any) => l.library_key === 'day_in_life')
  return existing?.id ?? null
}

async function importLibrary(peopleGroupId: number, name: string, prompts: string[]): Promise<{ success: boolean; error?: string }> {
  const content = prompts.map((prompt, i) => ({
    day_number: i + 1,
    language_code: 'en',
    content_json: buildContentJson(prompt),
  }))

  // Check if people group already has a day_in_life library
  const existingLibraryId = await findExistingDayInLifeLibrary(peopleGroupId)

  const body: Record<string, any> = {
    data: {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      library: {
        name: `${name} Prayer Fuel`,
        description: `365 days of prayer prompts for the ${name} people`,
      },
      content,
      stats: {
        totalDays: prompts.length,
        totalContentItems: content.length,
        languageCoverage: { en: content.length },
      },
    },
  }

  if (existingLibraryId) {
    // Replace content in existing library
    body.target_library_id = existingLibraryId
  } else {
    // Create new library linked to people group
    body.people_group_id = peopleGroupId
    body.library_key = 'day_in_life'
  }

  const res = await fetch(`${BASE_URL}/api/admin/libraries/import`, {
    method: 'POST',
    headers: authHeaders('application/json'),
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return { success: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` }
  }

  return { success: true }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  if (!existsSync(TODO_PATH)) {
    console.error(`ERROR: todo.csv not found at ${TODO_PATH}`)
    process.exit(1)
  }

  console.log(`Reading todo.csv: ${TODO_PATH}`)
  const todoText = readFileSync(TODO_PATH, 'utf-8')
  const rows = parseTodoCsv(todoText)
  console.log(`Found ${rows.length} people groups`)

  const pending = rows.filter(r => r.upload_done !== 'yes')
  const alreadyDone = rows.length - pending.length
  console.log(`Already done: ${alreadyDone}, Pending: ${pending.length}`)

  if (pending.length === 0) {
    console.log('Nothing to import!')
    return
  }

  // Fetch slug→id mapping from the API
  console.log(`\nFetching people groups from ${BASE_URL}...`)
  let slugToId: Map<string, number>
  try {
    slugToId = await fetchSlugToIdMap()
    console.log(`Authenticated OK — ${slugToId.size} people groups loaded`)
  } catch (err: any) {
    console.error(`ERROR: ${err.message}`)
    process.exit(1)
  }

  let succeeded = 0
  let failed = 0
  let skippedMissing = 0
  let skippedNoMatch = 0

  for (let i = 0; i < rows.length; i++) {
    if (LIMIT > 0 && succeeded >= LIMIT) break

    const row = rows[i]
    if (row.upload_done === 'yes') continue

    const peopleGroupId = slugToId.get(row.slug)
    if (!peopleGroupId) {
      console.log(`[${i + 1}/${rows.length}] SKIP ${row.name} — slug "${row.slug}" not found in database`)
      skippedNoMatch++
      continue
    }

    const csvPath = join(PROMPTS_DIR, `${row.slug}.csv`)
    if (!existsSync(csvPath)) {
      console.log(`[${i + 1}/${rows.length}] SKIP ${row.name} — CSV not found`)
      skippedMissing++
      continue
    }

    const csvText = readFileSync(csvPath, 'utf-8')
    const prompts = parsePromptCsv(csvText)

    if (prompts.length === 0) {
      console.log(`[${i + 1}/${rows.length}] SKIP ${row.name} — CSV is empty`)
      skippedMissing++
      continue
    }

    if (prompts.length !== 365) {
      console.warn(`[${i + 1}/${rows.length}] WARN ${row.name} — expected 365 prompts, got ${prompts.length}`)
    }

    console.log(`[${i + 1}/${rows.length}] Importing ${row.name} (people_group ${peopleGroupId}, ${prompts.length} prompts)...`)

    const result = await importLibrary(peopleGroupId, row.name, prompts)

    if (result.success) {
      console.log(`  OK`)
      succeeded++
      row.upload_done = 'yes'
      writeTodoCsv(rows)
    } else {
      console.error(`  FAILED: ${result.error}`)
      failed++
    }

    // Small delay between requests
    await new Promise(r => setTimeout(r, 100))
  }

  console.log(`\n--- Summary ---`)
  console.log(`Previously done: ${alreadyDone}`)
  console.log(`Succeeded: ${succeeded}`)
  console.log(`Failed: ${failed}`)
  console.log(`Skipped (no CSV): ${skippedMissing}`)
  console.log(`Skipped (slug not in DB): ${skippedNoMatch}`)
  console.log(`Total: ${rows.length}`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
