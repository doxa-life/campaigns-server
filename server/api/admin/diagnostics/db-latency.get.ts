export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const results: { query: string; ms: number }[] = []
  const queryCount = 10

  // Test 1: Simple SELECT 1 (multiple times to see warmup effect)
  for (let i = 0; i < queryCount; i++) {
    const start = performance.now()
    await sql`SELECT 1`
    const elapsed = performance.now() - start
    results.push({ query: `SELECT 1 (#${i + 1})`, ms: Math.round(elapsed * 100) / 100 })
  }

  // Test 2: Simple table query (if people_groups exists)
  try {
    const start = performance.now()
    await sql`SELECT COUNT(*) FROM people_groups`
    const elapsed = performance.now() - start
    results.push({ query: 'SELECT COUNT(*) FROM people_groups', ms: Math.round(elapsed * 100) / 100 })
  } catch (e) {
    results.push({ query: 'SELECT COUNT(*) FROM people_groups', ms: -1 })
  }

  // Test 3: Multiple parallel queries
  const parallelStart = performance.now()
  await Promise.all([
    sql`SELECT 1`,
    sql`SELECT 2`,
    sql`SELECT 3`,
    sql`SELECT 4`,
    sql`SELECT 5`,
  ])
  const parallelElapsed = performance.now() - parallelStart
  results.push({ query: '5 parallel SELECT queries', ms: Math.round(parallelElapsed * 100) / 100 })

  // Test 5: Create temp table for write tests
  const testTableName = `_diag_test_${Date.now()}`
  const unsafeSql = sql as any
  try {
    let start = performance.now()
    await unsafeSql.unsafe(`CREATE TABLE ${testTableName} (id SERIAL PRIMARY KEY, name TEXT, data TEXT, created_at TIMESTAMP DEFAULT NOW())`)
    let elapsed = performance.now() - start
    results.push({ query: 'CREATE TABLE', ms: Math.round(elapsed * 100) / 100 })

    // Test 6: Single INSERT
    start = performance.now()
    const inserted = await unsafeSql.unsafe(`INSERT INTO ${testTableName} (name, data) VALUES ($1, $2) RETURNING id`, ['test', 'some data'])
    elapsed = performance.now() - start
    results.push({ query: 'INSERT single row', ms: Math.round(elapsed * 100) / 100 })
    const insertedId = inserted[0]?.id

    // Test 7: Single UPDATE
    start = performance.now()
    await unsafeSql.unsafe(`UPDATE ${testTableName} SET name = $1, data = $2 WHERE id = $3`, ['updated', 'new data', insertedId])
    elapsed = performance.now() - start
    results.push({ query: 'UPDATE single row', ms: Math.round(elapsed * 100) / 100 })

    // Test 8: Multiple sequential INSERTs (simulating sync pattern)
    const insertTimes: number[] = []
    for (let i = 0; i < 10; i++) {
      start = performance.now()
      await unsafeSql.unsafe(`INSERT INTO ${testTableName} (name, data) VALUES ($1, $2)`, [`test${i}`, `data${i}`])
      elapsed = performance.now() - start
      insertTimes.push(elapsed)
    }
    const avgInsert = insertTimes.reduce((a, b) => a + b, 0) / insertTimes.length
    results.push({ query: '10 sequential INSERTs (avg)', ms: Math.round(avgInsert * 100) / 100 })
    results.push({ query: '10 sequential INSERTs (total)', ms: Math.round(insertTimes.reduce((a, b) => a + b, 0) * 100) / 100 })

    // Test 9: SELECT + UPDATE pattern (like sync does)
    const selectUpdateTimes: number[] = []
    for (let i = 0; i < 5; i++) {
      start = performance.now()
      const row = await unsafeSql.unsafe(`SELECT * FROM ${testTableName} WHERE name = $1 LIMIT 1`, [`test${i}`])
      if (row[0]) {
        await unsafeSql.unsafe(`UPDATE ${testTableName} SET data = $1 WHERE id = $2`, [`updated${i}`, row[0].id])
      }
      elapsed = performance.now() - start
      selectUpdateTimes.push(elapsed)
    }
    const avgSelectUpdate = selectUpdateTimes.reduce((a, b) => a + b, 0) / selectUpdateTimes.length
    results.push({ query: '5x SELECT+UPDATE pattern (avg)', ms: Math.round(avgSelectUpdate * 100) / 100 })
    results.push({ query: '5x SELECT+UPDATE pattern (total)', ms: Math.round(selectUpdateTimes.reduce((a, b) => a + b, 0) * 100) / 100 })

    // Test 10: Bulk INSERT (what sync SHOULD do)
    const bulkData = Array.from({ length: 100 }, (_, i) => [`bulk${i}`, `bulkdata${i}`])
    start = performance.now()
    await unsafeSql.unsafe(
      `INSERT INTO ${testTableName} (name, data) VALUES ${bulkData.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ')}`,
      bulkData.flat()
    )
    elapsed = performance.now() - start
    results.push({ query: 'BULK INSERT 100 rows', ms: Math.round(elapsed * 100) / 100 })

    // Cleanup
    start = performance.now()
    await unsafeSql.unsafe(`DROP TABLE ${testTableName}`)
    elapsed = performance.now() - start
    results.push({ query: 'DROP TABLE', ms: Math.round(elapsed * 100) / 100 })

  } catch (e: any) {
    results.push({ query: 'WRITE TESTS ERROR', ms: -1 })
    results.push({ query: e.message, ms: -1 })
    // Try to cleanup
    try {
      await unsafeSql.unsafe(`DROP TABLE IF EXISTS ${testTableName}`)
    } catch {}
  }

  // Calculate stats
  const selectOnes = results.filter(r => r.query.startsWith('SELECT 1')).map(r => r.ms)
  const avg = selectOnes.reduce((a, b) => a + b, 0) / selectOnes.length
  const min = Math.min(...selectOnes)
  const max = Math.max(...selectOnes)
  const first = selectOnes[0]
  const restAvg = selectOnes.slice(1).reduce((a, b) => a + b, 0) / (selectOnes.length - 1)

  // Extract write stats
  const singleInsert = results.find(r => r.query === 'INSERT single row')?.ms ?? -1
  const singleUpdate = results.find(r => r.query === 'UPDATE single row')?.ms ?? -1
  const seqInsertsAvg = results.find(r => r.query === '10 sequential INSERTs (avg)')?.ms ?? -1
  const selectUpdateAvg = results.find(r => r.query === '5x SELECT+UPDATE pattern (avg)')?.ms ?? -1
  const bulkInsert = results.find(r => r.query === 'BULK INSERT 100 rows')?.ms ?? -1

  return {
    summary: {
      reads: {
        simpleSelectAvgMs: Math.round(avg * 100) / 100,
        parallelQueriesMs: Math.round(parallelElapsed * 100) / 100,
      },
      writes: {
        singleInsertMs: singleInsert,
        singleUpdateMs: singleUpdate,
        sequentialInsertsAvgMs: seqInsertsAvg,
        selectUpdatePatternAvgMs: selectUpdateAvg,
        bulkInsert100RowsMs: bulkInsert,
      },
      projectedSyncTime: {
        current2085Groups: `${Math.round(2085 * selectUpdateAvg / 1000)} seconds (at ${selectUpdateAvg}ms per SELECT+UPDATE)`,
        withBulkUpsert: `${Math.round(bulkInsert * 21 / 1000)} seconds (21 batches of 100)`,
      }
    },
    details: results,
    interpretation: {
      firstQuerySlow: (first ?? 0) > restAvg * 2 ? 'First query significantly slower - connection warmup overhead' : 'First query normal',
      overallLatency: avg > 20 ? 'HIGH - Railway infrastructure issue likely' : avg > 5 ? 'MODERATE - some overhead present' : 'GOOD - latency acceptable',
      parallelEfficiency: parallelElapsed < avg * 5 ? 'Parallel queries efficient - connection pooling working' : 'Parallel queries slow - possible pooling issue',
      writePerformance: seqInsertsAvg > 10 ? 'SLOW writes - disk I/O or WAL issue' : seqInsertsAvg > 3 ? 'MODERATE write latency' : 'GOOD write performance',
    }
  }
})
