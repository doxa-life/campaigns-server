import type { Sql } from 'postgres'
import postgres from 'postgres'

// Test database connection (lazy initialized)
let testSql: ReturnType<typeof postgres> | null = null

function getTestSql(): ReturnType<typeof postgres> | null {
  if (testSql) return testSql

  const testUrl = process.env.TEST_DATABASE_URL
  if (!testUrl) return null

  testSql = postgres(testUrl, {
    ssl: testUrl.includes('localhost') ? false : { rejectUnauthorized: false },
    max: 5,
    idle_timeout: 10,
  })
  return testSql
}

// Get the production sql connection (auto-imported from base layer server/utils/database.ts)
function getProductionSql(): Sql {
  // sql is auto-imported by Nitro from the base layer's server/utils/database.ts
  // @ts-ignore - sql is auto-imported
  return sql
}

export function getSql(): Sql {
  if (process.env.VITEST && process.env.TEST_DATABASE_URL) {
    const testConnection = getTestSql()
    if (testConnection) return testConnection as any
  }
  return getProductionSql() as any
}
