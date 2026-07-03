import { defineEventHandler, createError } from 'h3'
import { handleApiError } from '#server/utils/api-helpers'

/**
 * Capture a V8-format heap snapshot of the instance that serves this request, store it
 * in the private S3 bucket, and return a signed download URL.
 *
 * The snapshot of a live heap is hundreds of MB, which can't be streamed back inline —
 * the gateway times out before the (blocking) generation produces a first byte. Routing
 * it through S3 keeps this response tiny; the heavy transfer is the browser pulling the
 * file from S3 directly via the signed `url`.
 *
 * Diagnostic for the memory climb: open `url` to download the `.heapsnapshot`, then in
 * Chrome DevTools -> Memory -> Summary, sort by Retained Size — the dominant non-builtin
 * constructor is the leak; its Retainers chain names the holder.
 *
 * The snapshot lands in the PRIVATE bucket because a live heap contains secrets and
 * subscriber PII; the URL is signed and short-lived. Delete the object once analysed.
 *
 * Generating the snapshot briefly pauses the event loop and allocates roughly the live
 * heap size again, so capture a mid-cycle instance (a few hundred MB), not one near its
 * memory limit, to avoid an OOM during capture. `hostname` identifies which instance
 * answered, since the load balancer routes to one at random.
 */
export default defineEventHandler(async (event) => {
  try {
    await requireSuperAdmin(event)

    const bun = (globalThis as any).Bun
    if (!bun?.generateHeapSnapshot) {
      throw createError({ statusCode: 500, statusMessage: 'Heap snapshots require the Bun runtime' })
    }

    const hostname = process.env.HOSTNAME || 'unknown-host'
    const mem = process.memoryUsage()

    // "v8" yields a Chrome DevTools-loadable snapshot; older runtimes return the
    // default object form, which we stringify as a fallback.
    const snapshot = bun.generateHeapSnapshot('v8')
    const json = typeof snapshot === 'string' ? snapshot : JSON.stringify(snapshot)
    const buffer = Buffer.from(json, 'utf8')

    const upload = await uploadToS3(
      buffer,
      `heap-${hostname}-${Date.now()}.heapsnapshot`,
      'application/json'
    )

    return {
      hostname,
      rss_mb: Math.round(mem.rss / 1024 / 1024),
      heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
      snapshot_bytes: buffer.length,
      key: upload.key,
      url: upload.url,
    }
  } catch (error) {
    handleApiError(error, 'Failed to capture heap snapshot')
  }
})
