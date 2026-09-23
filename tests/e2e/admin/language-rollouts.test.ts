import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { getTestDatabase, closeTestDatabase, cleanupTestData } from '../../helpers/db'
import { createAdminUser, createNoRoleUser } from '../../helpers/auth'

interface Task {
  key: string
  kind: 'detected' | 'skill' | 'manual'
  state: string
  note: string
  progress: { done: number; total: number } | null
  status_detail: string | null
  updated_by_name: string | null
}
interface Rollout { code: string; name_en: string; done_count: number; total_count: number; tasks: Task[] }

const CODE = 'zzr'

describe('Language rollouts', async () => {
  const sql = getTestDatabase()
  let adminAuth: { headers: { cookie: string } }
  let noRoleAuth: { headers: { cookie: string } }

  const task = (rollout: Rollout, key: string) => rollout.tasks.find(t => t.key === key)!

  beforeAll(async () => {
    await cleanupTestData(sql)
    adminAuth = (await createAdminUser(sql, { display_name: 'Test Rollout Admin' })).auth
    noRoleAuth = (await createNoRoleUser(sql)).auth
    await sql`
      INSERT INTO glossary_languages (code, name_en, name_local, notes)
      VALUES (${CODE}, 'Rolloutish', 'rolloutiska', 'Formal register.')
    `
  })

  afterAll(async () => {
    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  it('refuses a language that is not in the glossary', async () => {
    await expect($fetch('/api/admin/language-rollouts', {
      method: 'POST', body: { code: 'zzq' }, ...adminAuth
    })).rejects.toMatchObject({ statusCode: 404 })
  })

  it('starts a rollout with every task pending except what is detected', async () => {
    const { rollout } = await $fetch<{ rollout: Rollout }>('/api/admin/language-rollouts', {
      method: 'POST', body: { code: CODE }, ...adminAuth
    })
    expect(rollout.name_en).toBe('Rolloutish')
    expect(task(rollout, 'glossary-notes').state).toBe('done')
    expect(task(rollout, 'enabled-campaigns').state).toBe('pending')
    expect(task(rollout, 'glossary-terms').progress).not.toBeNull()
    expect(task(rollout, 'playbook').state).toBe('pending')
    expect(task(rollout, 'homepage-video').kind).toBe('manual')
  })

  it('starting again leaves the rollout as it is', async () => {
    await $fetch(`/api/admin/language-rollouts/${CODE}/tasks/playbook`, {
      method: 'PUT', body: { state: 'done' }, ...adminAuth
    })
    const { rollout } = await $fetch<{ rollout: Rollout }>('/api/admin/language-rollouts', {
      method: 'POST', body: { code: CODE }, ...adminAuth
    })
    expect(task(rollout, 'playbook').state).toBe('done')
  })

  it('ticks a manual task and stores who did it', async () => {
    const { rollout } = await $fetch<{ rollout: Rollout }>(`/api/admin/language-rollouts/${CODE}/tasks/homepage-video`, {
      method: 'PUT', body: { state: 'done', note: 'Subtitled' }, ...adminAuth
    })
    const video = task(rollout, 'homepage-video')
    expect(video.state).toBe('done')
    expect(video.note).toBe('Subtitled')
    expect(video.updated_by_name).toBe('Test Rollout Admin')
  })

  it('resetting to pending removes the stored state', async () => {
    await $fetch(`/api/admin/language-rollouts/${CODE}/tasks/homepage-video`, {
      method: 'PUT', body: { state: 'pending' }, ...adminAuth
    })
    const rows = await sql`SELECT 1 FROM language_rollout_tasks WHERE code = ${CODE} AND task_key = 'homepage-video'`
    expect(rows).toHaveLength(0)
  })

  it('rejects setting a detected task, an unknown task and an unknown state', async () => {
    await expect($fetch(`/api/admin/language-rollouts/${CODE}/tasks/glossary-notes`, {
      method: 'PUT', body: { state: 'done' }, ...adminAuth
    })).rejects.toMatchObject({ statusCode: 400 })
    await expect($fetch(`/api/admin/language-rollouts/${CODE}/tasks/no-such-task`, {
      method: 'PUT', body: { state: 'done' }, ...adminAuth
    })).rejects.toMatchObject({ statusCode: 404 })
    await expect($fetch(`/api/admin/language-rollouts/${CODE}/tasks/playbook`, {
      method: 'PUT', body: { state: 'finished' }, ...adminAuth
    })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('shows the status report line under the matching skill task', async () => {
    await $fetch(`/api/admin/language-rollouts/${CODE}/tasks/marketing`, {
      method: 'PUT', body: { state: 'failed', note: 'repo not on this machine' }, ...adminAuth
    })
    const { rollout } = await $fetch<{ rollout: Rollout }>(`/api/admin/language-rollouts/${CODE}/status-report`, {
      method: 'PUT',
      body: { report: { code: CODE, surfaces: [{ surface: 'marketing', state: 'missing', detail: 'not in config/languages.ts' }] } },
      ...adminAuth
    })
    const marketing = task(rollout, 'marketing')
    expect(marketing.state).toBe('failed')
    expect(marketing.status_detail).toBe('missing — not in config/languages.ts')
  })

  it('lists rollouts with the task groups', async () => {
    const res = await $fetch<{ groups: { key: string }[]; rollouts: Rollout[] }>('/api/admin/language-rollouts', adminAuth)
    expect(res.groups.map(g => g.key)).toEqual(['glossary', 'code', 'content', 'launch'])
    expect(res.rollouts.some(r => r.code === CODE)).toBe(true)
  })

  it('requires the glossary permissions', async () => {
    await expect($fetch('/api/admin/language-rollouts', noRoleAuth)).rejects.toMatchObject({ statusCode: 403 })
    await expect($fetch(`/api/admin/language-rollouts/${CODE}/tasks/playbook`, {
      method: 'PUT', body: { state: 'done' }, ...noRoleAuth
    })).rejects.toMatchObject({ statusCode: 403 })
  })

  it('stops tracking a rollout', async () => {
    await $fetch(`/api/admin/language-rollouts/${CODE}`, { method: 'DELETE', ...adminAuth })
    const rows = await sql`SELECT 1 FROM language_rollout_tasks WHERE code = ${CODE}`
    expect(rows).toHaveLength(0)
    await expect($fetch(`/api/admin/language-rollouts/${CODE}`, adminAuth)).rejects.toMatchObject({ statusCode: 404 })
  })
})
