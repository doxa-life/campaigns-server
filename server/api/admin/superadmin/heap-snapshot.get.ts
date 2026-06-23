import { defineEventHandler, setResponseHeader, createError } from 'h3'
import { handleApiError } from '#server/utils/api-helpers'

/**
 * Capture a V8-format heap snapshot of the instance that serves this request and
 * stream it straight back as a downloadable file (nothing is stored).
 *
 * Diagnostic for the slow memory climb: take two captures from the same `hostname`
 * roughly an hour apart, open both in Chrome DevTools -> Memory -> "Comparison", and
 * the object class whose count grew between them — followed up its retainer chain —
 * is what is being held in the heap.
 *
 * Superadmin-only. The snapshot contains secrets and subscriber PII, so it is only
 * ever handed to the authenticated caller; treat the downloaded file accordingly and
 * delete it once analysed.
 *
 * Generating the snapshot briefly pauses the event loop and allocates memory in
 * proportion to the live heap, so run it off-peak. With several instances behind the
 * load balancer the request lands on one at random; the download filename and the
 * `X-Heap-Hostname` header report which instance served it, so two captures can be
 * paired to the same process.
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

    setResponseHeader(event, 'Content-Type', 'application/json; charset=utf-8')
    setResponseHeader(event, 'Content-Disposition', `attachment; filename="heap-${hostname}-${Date.now()}.heapsnapshot"`)
    setResponseHeader(event, 'X-Heap-Hostname', hostname)
    setResponseHeader(event, 'X-Heap-Rss-Mb', String(Math.round(mem.rss / 1024 / 1024)))
    return json
  } catch (error) {
    handleApiError(error, 'Failed to capture heap snapshot')
  }
})
