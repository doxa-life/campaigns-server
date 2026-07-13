import { inboxTagService } from '../database/inbox-tags'

/**
 * Seed the three feedback inbox tags into the tag palette at startup so messages
 * from the app's feedback form (/api/feedback) render a filterable, colour-coded
 * folder in the admin inbox rail. inboxTagService.create() is idempotent — it
 * returns the existing tag when the slug is already present — so this is safe to
 * run on every boot.
 */
export default defineNitroPlugin(() => {
  const tags: Array<{ name: string; color: 'success' | 'info' | 'warning' }> = [
    { name: 'Feedback: Compliment', color: 'success' },
    { name: 'Feedback: Suggestion', color: 'info' },
    { name: 'Feedback: Problem', color: 'warning' },
  ]

  // Run after startup without blocking boot; failures are logged, not fatal.
  Promise.all(tags.map(t => inboxTagService.create(t.name, t.color)))
    .catch(err => console.error('[SeedFeedbackTags] Failed to seed feedback tags:', err))
})
