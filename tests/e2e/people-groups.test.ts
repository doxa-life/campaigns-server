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

  it('returns the compressed copy only when asked, falling back to the original', async () => {
    const original = 'https://example.org/photos/original.jpg'
    const copy = 'https://cdn.example.org/uploads/people-group-images/copy.jpg'
    const copied = await createTestPeopleGroup(sql)
    const uncopied = await createTestPeopleGroup(sql)
    await sql`UPDATE people_groups SET image_url = ${original} WHERE id = ${copied.id}`
    await sql`UPDATE people_groups SET image_url = 'https://example.org/photos/other.jpg' WHERE id = ${uncopied.id}`
    await sql`INSERT INTO people_group_image_copies (source_url, copy_url) VALUES (${original}, ${copy})`

    try {
      const requested = await $fetch('/api/people-groups/list', {
        query: { fields: 'slug,image_url,compressed_image_url' }
      })
      const bySlug = Object.fromEntries(requested.posts.map((p: any) => [p.slug, p]))
      expect(bySlug[copied.slug]).toEqual({ slug: copied.slug, image_url: original, compressed_image_url: copy })
      expect(bySlug[uncopied.slug].compressed_image_url).toBe('https://example.org/photos/other.jpg')

      // Existing consumers see exactly what they did before.
      const defaults = await $fetch('/api/people-groups/list')
      const plain = defaults.posts.find((p: any) => p.slug === copied.slug)
      expect(plain.image_url).toBe(original)
      expect(plain).not.toHaveProperty('compressed_image_url')

      const detail = await $fetch(`/api/people-groups/detail/${copied.slug}`)
      expect(detail.image_url).toBe(original)
      expect(detail.compressed_image_url).toBe(copy)
    } finally {
      await sql`DELETE FROM people_group_image_copies WHERE source_url = ${original}`
    }
  })
})
