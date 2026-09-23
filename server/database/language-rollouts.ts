import { getSql } from './db'
import { LANGUAGES } from '../../config/languages'
import {
  ROLLOUT_TASKS,
  type RolloutTaskDef,
  type RolloutTaskKind,
  type RolloutTaskState
} from '../../config/language-rollout-tasks'

export interface RolloutTask {
  key: string
  group: string
  kind: RolloutTaskKind
  label: string
  description: string
  state: RolloutTaskState
  note: string
  // Counts for a detected task that measures coverage (e.g. descriptions translated).
  progress: { done: number; total: number } | null
  // One line from the latest language-status report, for a skill task.
  status_detail: string | null
  updated_at: string | null
  updated_by_name: string | null
}

export interface LanguageRollout {
  code: string
  name_en: string
  name_local: string
  started_at: string
  started_by_name: string | null
  status_report_at: string | null
  done_count: number
  total_count: number
  tasks: RolloutTask[]
}

interface RolloutRow {
  code: string
  name_en: string
  name_local: string
  started_at: string
  started_by_name: string | null
  status_report: { surfaces?: { surface: string; state: string; detail?: string }[] } | null
  status_report_at: string | null
}

interface TaskRow {
  code: string
  task_key: string
  state: RolloutTaskState
  note: string
  updated_at: string
  updated_by_name: string | null
}

type Detection = { state: RolloutTaskState; progress: { done: number; total: number } | null; note: string }

function coverage(done: number, total: number): Detection {
  return {
    state: total > 0 && done >= total ? 'done' : done > 0 ? 'running' : 'pending',
    progress: { done, total },
    note: ''
  }
}

/** The detected tasks for each language, computed from the glossary, content and code. */
async function detect(codes: string[]): Promise<Map<string, Map<string, Detection>>> {
  const sql = getSql()
  const result = new Map<string, Map<string, Detection>>()
  if (codes.length === 0) return result

  const glossary = await sql<{ code: string; notes: string; term_count: number; confirmed_count: number }[]>`
    SELECT
      l.code,
      l.notes,
      (SELECT COUNT(*)::int FROM glossary_terms) AS term_count,
      COUNT(t.id) FILTER (WHERE t.status = 'confirmed')::int AS confirmed_count
    FROM glossary_languages l
    LEFT JOIN glossary_translations t ON t.language_id = l.id
    WHERE l.code IN ${sql(codes)}
    GROUP BY l.id
  `

  const descriptions = await sql<{ code: string; done: number; total: number }[]>`
    SELECT c.code,
      COUNT(*) FILTER (WHERE COALESCE(TRIM(pg.descriptions->>c.code), '') <> '')::int AS done,
      COUNT(*)::int AS total
    FROM people_groups pg
    CROSS JOIN UNNEST(${codes}::text[]) AS c(code)
    WHERE COALESCE(pg.status, 'active') = 'active'
      AND COALESCE(TRIM(pg.descriptions->>'en'), '') <> ''
    GROUP BY c.code
  `

  // Shared libraries are the real rows with no people group; every English day
  // is one day to translate.
  const libraries = await sql<{ code: string; done: number; total: number }[]>`
    SELECT c.code,
      COUNT(tr.id)::int AS done,
      COUNT(en.id)::int AS total
    FROM library_content en
    JOIN libraries lib ON lib.id = en.library_id
    CROSS JOIN UNNEST(${codes}::text[]) AS c(code)
    LEFT JOIN library_content tr
      ON tr.library_id = en.library_id AND tr.day_number = en.day_number AND tr.language_code = c.code
    WHERE lib.people_group_id IS NULL AND lib.type = 'static' AND en.language_code = 'en'
    GROUP BY c.code
  `

  for (const code of codes) {
    const tasks = new Map<string, Detection>()
    const g = glossary.find(row => row.code === code)
    tasks.set('glossary-terms', coverage(g?.confirmed_count ?? 0, g?.term_count ?? 0))
    tasks.set('glossary-notes', { state: g?.notes?.trim() ? 'done' : 'pending', progress: null, note: '' })

    const d = descriptions.find(row => row.code === code)
    tasks.set('people-group-descriptions', coverage(d?.done ?? 0, d?.total ?? 0))

    const l = libraries.find(row => row.code === code)
    tasks.set('shared-libraries', coverage(l?.done ?? 0, l?.total ?? 0))

    const configured = LANGUAGES.find(lang => lang.code === code)
    tasks.set('enabled-campaigns', {
      state: configured && configured.enabled !== false ? 'done' : 'pending',
      progress: null,
      note: !configured ? 'Not in config/languages.ts' : configured.enabled === false ? 'Registered but switched off' : ''
    })

    result.set(code, tasks)
  }
  return result
}

function buildTask(
  def: RolloutTaskDef,
  stored: TaskRow | undefined,
  detected: Detection | undefined,
  report: RolloutRow['status_report']
): RolloutTask {
  const surface = def.kind === 'skill'
    ? report?.surfaces?.find(s => s.surface === def.key)
    : undefined
  const base = {
    key: def.key,
    group: def.group,
    kind: def.kind,
    label: def.label,
    description: def.description,
    status_detail: surface ? [surface.state, surface.detail].filter(Boolean).join(' — ') : null
  }

  if (def.kind === 'detected') {
    return {
      ...base,
      state: detected?.state ?? 'pending',
      note: detected?.note ?? '',
      progress: detected?.progress ?? null,
      updated_at: null,
      updated_by_name: null
    }
  }

  return {
    ...base,
    state: stored?.state ?? 'pending',
    note: stored?.note ?? '',
    progress: null,
    updated_at: stored?.updated_at ?? null,
    updated_by_name: stored?.updated_by_name ?? null
  }
}

export async function listRollouts(code?: string): Promise<LanguageRollout[]> {
  const sql = getSql()
  const rollouts = await sql<RolloutRow[]>`
    SELECT r.code, l.name_en, l.name_local, r.started_at, u.display_name AS started_by_name,
      r.status_report, r.status_report_at
    FROM language_rollouts r
    JOIN glossary_languages l ON l.code = r.code
    LEFT JOIN users u ON u.id = r.started_by
    ${code ? sql`WHERE r.code = ${code}` : sql``}
    ORDER BY r.started_at DESC
  `
  const codes = rollouts.map(r => r.code)
  if (codes.length === 0) return []

  const taskRows = await sql<TaskRow[]>`
    SELECT t.code, t.task_key, t.state, t.note, t.updated_at, u.display_name AS updated_by_name
    FROM language_rollout_tasks t
    LEFT JOIN users u ON u.id = t.updated_by
    WHERE t.code IN ${sql(codes)}
  `
  const detected = await detect(codes)

  return rollouts.map(r => {
    const tasks = ROLLOUT_TASKS.map(def => buildTask(
      def,
      taskRows.find(t => t.code === r.code && t.task_key === def.key),
      detected.get(r.code)?.get(def.key),
      r.status_report
    ))
    return {
      code: r.code,
      name_en: r.name_en,
      name_local: r.name_local,
      started_at: r.started_at,
      started_by_name: r.started_by_name,
      status_report_at: r.status_report_at,
      done_count: tasks.filter(t => t.state === 'done' || t.state === 'skipped').length,
      total_count: tasks.length,
      tasks
    }
  })
}

export async function getRollout(code: string): Promise<LanguageRollout | null> {
  const [rollout] = await listRollouts(code)
  return rollout ?? null
}

/** Starts a rollout, or leaves an existing one as it is. */
export async function startRollout(code: string, userId: string): Promise<void> {
  const sql = getSql()
  await sql`
    INSERT INTO language_rollouts (code, started_by)
    VALUES (${code}, ${userId})
    ON CONFLICT (code) DO NOTHING
  `
}

export async function deleteRollout(code: string): Promise<boolean> {
  const sql = getSql()
  const rows = await sql`DELETE FROM language_rollouts WHERE code = ${code} RETURNING code`
  return rows.length > 0
}

/** "pending" is the default, so setting it removes the stored row. */
export async function setTaskState(
  code: string,
  taskKey: string,
  state: RolloutTaskState,
  note: string,
  userId: string
): Promise<void> {
  const sql = getSql()
  if (state === 'pending') {
    await sql`DELETE FROM language_rollout_tasks WHERE code = ${code} AND task_key = ${taskKey}`
    return
  }
  await sql`
    INSERT INTO language_rollout_tasks (code, task_key, state, note, updated_by, updated_at)
    VALUES (${code}, ${taskKey}, ${state}, ${note}, ${userId}, NOW())
    ON CONFLICT (code, task_key) DO UPDATE
      SET state = EXCLUDED.state, note = EXCLUDED.note,
          updated_by = EXCLUDED.updated_by, updated_at = NOW()
  `
}

export async function saveStatusReport(code: string, report: unknown): Promise<void> {
  const sql = getSql()
  await sql`
    UPDATE language_rollouts
    SET status_report = ${sql.json(report as any)}, status_report_at = NOW()
    WHERE code = ${code}
  `
}
