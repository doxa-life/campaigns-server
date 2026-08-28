import { warmJoshuaProjectCache } from '../utils/app/joshua-project'

/**
 * Preload the Joshua Project dataset cache at startup so the /updates add-flow
 * search has JP results ready instead of IMB-only until the first lazy load
 * finishes (~175 paged requests, minutes). Production-only by default — dev
 * servers restart constantly and would hammer the JP API.
 */
export default defineNitroPlugin(() => {
  if (process.env.VITEST) return

  const enabled = process.env.ENABLE_JP_WARMUP === 'true'
  const isProduction = process.env.NODE_ENV === 'production'
  if (!enabled && !isProduction) return

  warmJoshuaProjectCache()
})
