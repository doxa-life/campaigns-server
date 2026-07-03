import { defineEventHandler } from 'h3'
import { handleApiError } from '#server/utils/api-helpers'

/**
 * Report the serving instance's memory breakdown, with enough detail to classify a
 * climb without a heap snapshot. Cheap to poll; diff two samples from the same
 * hostname to see what is growing:
 *
 * - `object_counts` (JSC per-class object counts): a class whose count keeps rising
 *   names a JS-heap leak directly.
 * - `protected_object_counts`: objects pinned by native code and thus invisible to
 *   GC pressure — a rising class here means native code is retaining JS objects.
 * - `active_resources`: live handles (sockets, timers, streams) by type — a rising
 *   count means a handle leak in the subsystem that owns that type.
 * - `mimalloc`: Bun's native allocator. `malloc_live_mb` rising means a genuine
 *   native-memory leak; `committed_mb` rising while live stays flat means the
 *   allocator is retaining freed memory (fragmentation), not a code leak.
 *
 * The Bun-specific sections are null under other runtimes. Superadmin-only.
 * `hostname` identifies which instance answered, since requests land on one at
 * random behind the load balancer.
 */
export default defineEventHandler(async (event) => {
  try {
    await requireSuperAdmin(event)

    const m = process.memoryUsage()
    const mb = (n: number) => Math.round((n / 1024 / 1024) * 10) / 10

    // Live handles bucketed by type (e.g. TCPSocketWrap, Timeout).
    let activeResources: Record<string, number> | null = null
    try {
      const infos = (process as any).getActiveResourcesInfo?.() as string[] | undefined
      if (infos) {
        activeResources = {}
        for (const type of infos) activeResources[type] = (activeResources[type] || 0) + 1
      }
    } catch {
      // introspection unsupported on this runtime
    }

    // JSC heap statistics via bun:jsc. process.getBuiltinModule resolves runtime
    // built-ins without bundler involvement and returns undefined off-Bun.
    let jsc: Record<string, unknown> | null = null
    let objectCounts: Record<string, number> | null = null
    let protectedObjectCounts: Record<string, number> | null = null
    let mimalloc: Record<string, unknown> | null = null
    try {
      const jscModule = (process as any).getBuiltinModule?.('bun:jsc')
      if (jscModule?.heapStats) {
        const s = jscModule.heapStats()
        jsc = {
          heap_size_mb: mb(s.heapSize),
          heap_capacity_mb: mb(s.heapCapacity),
          extra_memory_mb: mb(s.extraMemorySize),
          object_count: s.objectCount,
          protected_object_count: s.protectedObjectCount,
        }
        // Top classes by instance count; the full list runs to hundreds of
        // one-off entries that would only add noise to a diff.
        objectCounts = Object.fromEntries(
          Object.entries(s.objectTypeCounts as Record<string, number>)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 50)
        )
        protectedObjectCounts = s.protectedObjectTypeCounts
        const mi = s.mimalloc
        if (mi?.process) {
          mimalloc = {
            rss_mb: mb(mi.process.rss_current),
            commit_mb: mb(mi.process.commit_current),
            reserved_mb: mb(mi.reserved?.current ?? 0),
            committed_mb: mb(mi.committed?.current ?? 0),
            malloc_live_mb: mb((mi.malloc_normal?.current ?? 0) + (mi.malloc_huge?.current ?? 0)),
            malloc_normal_count: mi.malloc_normal_count,
            malloc_huge_count: mi.malloc_huge_count,
            threads: mi.threads?.current,
          }
        }
      }
    } catch {
      // bun:jsc unavailable; report the portable fields only
    }

    return {
      hostname: process.env.HOSTNAME || 'unknown-host',
      captured_at: new Date().toISOString(),
      rss_mb: mb(m.rss),
      heap_total_mb: mb(m.heapTotal),
      heap_used_mb: mb(m.heapUsed),
      external_mb: mb(m.external),
      array_buffers_mb: mb(m.arrayBuffers),
      active_resources: activeResources,
      jsc,
      object_counts: objectCounts,
      protected_object_counts: protectedObjectCounts,
      mimalloc,
    }
  } catch (error) {
    handleApiError(error, 'Failed to read memory usage')
  }
})
