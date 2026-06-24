import { defineEventHandler } from 'h3'
import { handleApiError } from '#server/utils/api-helpers'

/**
 * Report the serving instance's memory breakdown.
 *
 * A heap snapshot only sees the JS object graph, so an off-heap climb is invisible
 * to it. This surfaces the off-heap pools — `external` and `arrayBuffers` (Buffer /
 * ArrayBuffer bytes) — so a climb can be classified: growth in external/arrayBuffers
 * is a Buffer leak; growth in rss while heap and external stay flat is native-allocator
 * or native-module memory. Cheap to poll, so it can be sampled on a short interval.
 *
 * Superadmin-only. `hostname` identifies which instance answered, since requests land
 * on one at random behind the load balancer.
 */
export default defineEventHandler(async (event) => {
  try {
    await requireSuperAdmin(event)

    const m = process.memoryUsage()
    const mb = (n: number) => Math.round((n / 1024 / 1024) * 10) / 10

    return {
      hostname: process.env.HOSTNAME || 'unknown-host',
      captured_at: new Date().toISOString(),
      rss_mb: mb(m.rss),
      heap_total_mb: mb(m.heapTotal),
      heap_used_mb: mb(m.heapUsed),
      external_mb: mb(m.external),
      array_buffers_mb: mb(m.arrayBuffers),
    }
  } catch (error) {
    handleApiError(error, 'Failed to read memory usage')
  }
})
