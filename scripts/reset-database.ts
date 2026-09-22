#!/usr/bin/env tsx

import postgres from 'postgres'
import { readFileSync } from 'fs'
import { join } from 'path'
import { MigrationRunner } from '../../../base/server/utils/migrations.js'
import bcrypt from 'bcrypt'
import { randomUUID } from 'crypto'

// Load .env file
function loadEnv() {
  try {
    const envPath = join(process.cwd(), '.env')
    const envContent = readFileSync(envPath, 'utf-8')

    envContent.split('\n').forEach(line => {
      // Skip empty lines and comments
      if (!line || line.trim().startsWith('#')) return

      const [key, ...valueParts] = line.split('=')
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim()
        process.env[key.trim()] = value
      }
    })
  } catch (error) {
    console.warn('⚠️  Could not load .env file:', error)
  }
}

async function resetDatabase() {
  console.log('🔄 Resetting database...\n')

  // Load environment variables from .env
  loadEnv()

  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl) {
    console.error('❌ No DATABASE_URL found in environment variables.')
    console.error('Please set DATABASE_URL in your .env file or environment.')
    process.exit(1)
  }

  const sql = postgres(databaseUrl, {
    max: 5
  })

  try {
    // Test connection
    await sql`SELECT NOW()`
    console.log('✅ Database connection successful\n')

    // Step 1: Drop all tables
    console.log('🗑️  Dropping all tables...')

    // Get all table names in public schema
    const tables = await sql`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
    `

    if (tables.length > 0) {
      console.log(`   Found ${tables.length} table(s) to drop:`)
      tables.forEach(t => console.log(`     - ${t.tablename}`))

      // Drop all tables with CASCADE
      for (const table of tables) {
        await sql`DROP TABLE IF EXISTS ${sql(table.tablename)} CASCADE`
      }
      console.log('✅ All tables dropped successfully\n')
    } else {
      console.log('   No tables found to drop\n')
    }

    // Step 2: Run migrations
    console.log('🔄 Running migrations...\n')
    const migrationRunner = new MigrationRunner(sql)
    await migrationRunner.runMigrations()
    console.log('\n✅ All migrations completed successfully\n')

    // Step 3: Create default admin user
    console.log('👤 Creating default admin user...')

    const adminEmail = 'admin@prayertools.com'
    const adminPassword = 'admin123'
    const adminDisplayName = 'Admin User'

    // Hash password
    const passwordHash = await bcrypt.hash(adminPassword, 12)
    const tokenKey = randomUUID()

    // Create user
    await sql`
      INSERT INTO users (email, password, display_name, token_key, verified, roles)
      VALUES (${adminEmail}, ${passwordHash}, ${adminDisplayName}, ${tokenKey}, true, ARRAY['admin'])
    `

    console.log('✅ Default admin user created successfully')
    console.log(`   Email: ${adminEmail}`)
    console.log(`   Password: ${adminPassword}`)
    console.log(`   Role: admin`)
    console.log(`   Verified: true\n`)

    console.log('🎉 Database reset completed successfully!')
    console.log('\n📝 Next steps:')
    console.log('   1. Start your application: npm run dev')
    console.log('   2. Log in with the admin credentials above\n')

  } catch (error) {
    console.error('❌ Failed to reset database:', error)
    process.exit(1)
  } finally {
    await sql.end()
  }
}

// Run the reset if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  resetDatabase().catch(console.error)
}

export { resetDatabase }
