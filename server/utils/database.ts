import postgres from 'postgres'

// Database connection will be initialized lazily
let connection: ReturnType<typeof postgres> | null = null

// Initialize database connection
function initConnection() {
  if (connection) return connection

  // Get database URL from runtime config or environment variable
  const databaseUrl = useRuntimeConfig().databaseUrl || process.env.DATABASE_URL

  if (!databaseUrl) {
    console.warn('DATABASE_URL environment variable is not set')
    return null
  }

  // Detect if this is a localhost connection (no SSL required)
  const isLocalhost = databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1')

  // Create postgres connection
  // Cloud databases (Neon, etc.) require SSL, localhost doesn't
  connection = postgres(databaseUrl, {
    ssl: isLocalhost ? false : 'require',
    max: 10, // Maximum number of connections
    idle_timeout: 20,
    connect_timeout: 30, // Increased timeout for initial connection
    onnotice: () => {}, // Suppress NOTICE messages (e.g., "table already exists, skipping")
  })

  return connection
}

// Create a function that acts as a proxy for the sql connection
function sqlProxy(...args: any[]): any {
  const connection = initConnection()
  if (!connection) {
    throw new Error('Database not configured')
  }
  // Handle tagged template literal calls
  return (connection as any)(...args)
}

// Add a proxy to handle property access (like sql.begin, sql.end, etc.)
export const sql = new Proxy(sqlProxy, {
  get(target, prop) {
    const connection = initConnection()
    if (!connection) {
      throw new Error('Database not configured')
    }
    return (connection as any)[prop]
  }
})

// Helper function to check if a table exists
export async function tableExists(tableName: string): Promise<boolean> {
  const result = await sql`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = ${tableName}
    ) as exists
  `
  return result[0]?.exists || false
}
