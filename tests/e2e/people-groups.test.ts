import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { getTestDatabase, closeTestDatabase, cleanupTestData, createTestPeopleGroup } from '../helpers/db'

describe('GET /api/people-groups/list', async () => {
  const sql = getTestDatabase()

  afterEach(async () => {
    await cleanupTestData(sql)
  })

  afterAll(async () => {
    await closeTestDatabase()
  })

  it('returns empty array when no people groups exist', async () => {
    const response = await $fetch('/api/people-groups/list')

    expect(response).toHaveProperty('posts')
    expect(Array.isArray(response.posts)).toBe(true)
  })

  it('returns people groups', async () => {
    const peopleGroup = await createTestPeopleGroup(sql, {
      title: 'Test Prayer People Group'
    })

    const response = await $fetch('/api/people-groups/list')

    expect(response.posts).toContainEqual(
      expect.objectContaining({
        slug: peopleGroup.slug,
        name: 'Test Prayer People Group'
      })
    )
  })
})
