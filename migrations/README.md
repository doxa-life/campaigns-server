# PostgreSQL Migrations System

This directory contains database migrations for the Prayer Tools application, providing a structured way to manage database schema changes over time.

## Migration Structure

Each migration is a JavaScript/TypeScript file that exports a default class extending `BaseMigration`:

```javascript
export default class MyMigration extends BaseMigration {
  id = 1
  name = 'My Migration Description'

  async up(pool) {
    // Migration logic here
    await this.exec(pool, 'CREATE TABLE example (id SERIAL PRIMARY KEY)')
  }

  // Optional: implement down migration
  async down(pool) {
    await this.exec(pool, 'DROP TABLE example')
  }
}
```

## Helper Methods

The `BaseMigration` class provides several helper methods:

- `exec(pool, sql)` - Execute SQL statement
- `query(pool, sql, params)` - Execute query and return all rows
- `queryOne(pool, sql, params)` - Execute query and return first row
- `tableExists(pool, tableName)` - Check if table exists
- `columnExists(pool, tableName, columnName)` - Check if column exists
- `indexExists(pool, indexName)` - Check if index exists

## Benefits of This Migration System

1. **Version Control**: Track database changes alongside code changes
2. **Reproducibility**: Consistent database setup across environments
3. **Complex Logic**: Implement complex migration logic with full JavaScript/TypeScript capabilities
4. **Error Handling**: Proper transaction handling with automatic rollback on errors
5. **Type Safety**: Full TypeScript support for type checking
6. **Testing**: Easier to unit test migration logic

## Migration Files

- **001_initial_schema.js** - Creates initial database schema with all core tables

## Usage

Migrations are **automatically executed** when the application starts. The system runs all pending migrations during database initialization.

### For New Installations

Simply start the application - migrations will run automatically:

```bash
npm run dev
# or
npm run build && npm start
```

### For Existing Databases

Migrations will only run if they haven't been executed yet. The system tracks completed migrations in the `migrations` table.

## How It Works

1. **Automatic Execution**: Migrations run automatically when the application starts
2. **Sequential Processing**: Migrations are executed in ID order (001, 002, 003, etc.)
3. **Transaction Safety**: Each migration runs in a transaction and rolls back on error
4. **Progress Tracking**: Completed migrations are recorded in the `migrations` database table
5. **Error Handling**: If a migration fails, the process stops and reports the error

## Migration Naming

Migrations should be named with the pattern: `{number}_{description}.js`

Examples:
- `001_initial_schema.js`
- `002_add_user_preferences.js`
- `003_create_notifications_table.js`

## Adding New Migrations

1. **Create the file**: Use the next sequential number: `002_your_migration_name.js`
2. **Implement the class**: Extend `BaseMigration` and implement the `up()` method
3. **Add logic**: Use JavaScript/TypeScript for complex operations
4. **Test first**: Always test on a copy of your database
5. **Deploy**: Restart the application to apply the migration automatically

### Example New Migration

```javascript
export default class AddUserPreferencesMigration {
  id = 2
  name = 'Add User Preferences Table'

  async exec(pool, sql) {
    await pool.query(sql)
  }

  async up(pool) {
    // Create the table
    await this.exec(pool, `
      CREATE TABLE IF NOT EXISTS user_preferences (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        theme TEXT DEFAULT 'light',
        language TEXT DEFAULT 'en',
        notifications BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `)

    // Add indexes
    await this.exec(pool, `
      CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id
      ON user_preferences (user_id)
    `)

    console.log('✅ User preferences table created')
  }
}
```

## Seeding glossary languages

The glossary ships with the languages whose reviewed wording is in `data/glossary/languages/`; migration 101 seeds every file there on a fresh database. Drafts still awaiting a reviewer live in `data/glossary/unreviewed/` and are not seeded. To enable one or more languages after 101 has run in production:

1. Put the reviewer's wording into `data/glossary/unreviewed/xx.json`.
2. `git mv data/glossary/unreviewed/xx.json data/glossary/languages/xx.json`, once per language being enabled.
3. Add one migration naming every code being enabled in this step:

```javascript
import { seedGlossaryLanguages } from './lib/glossary-seed.js'

export default class SeedGlossaryItalianRomanianMigration {
  id = 1NN
  name = 'Seed the Italian and Romanian glossaries from their reviewed files'

  async up(sql) {
    await seedGlossaryLanguages(sql, ['it', 'ro'])
  }
}
```

4. Deploy. Production seeds those codes from the new migration. A fresh database gets them from 101, and the new migration finds them present and skips.

## Testing

You can test the migration system using:

```bash
npx tsx scripts/test-migrations.ts
```

## Database Schema

After all migrations, the database contains:

### Core Tables
- `users` - User accounts with authentication and profile information
- `roles` - User roles (admin, moderator, etc.)
- `user_roles` - Junction table linking users to roles
- `permissions` - System permissions
- `role_permissions` - Junction table linking roles to permissions
- `campaigns` - Prayer campaigns with settings and metadata
- `prayer_content` - Daily prayer content for campaigns
- `reminder_signups` - User signup information for prayer reminders
- `prayer_activity` - Tracking of prayer engagement

### System Tables
- `migrations` - Migration execution tracking

## PostgreSQL-Specific Features

This migration system is designed specifically for PostgreSQL and takes advantage of:

- **SERIAL** type for auto-incrementing IDs
- **Transaction support** for safe migration execution
- **information_schema** for checking table/column existence
- **CHECK constraints** for data validation
- **Foreign key constraints** with CASCADE options

## Key Features

- **Automatic Execution**: No manual intervention required
- **Transaction Safety**: Each migration runs in a transaction
- **Schema Evolution**: Handles complex schema changes safely
- **Idempotent Design**: Use `IF NOT EXISTS` for safe re-runs
- **Progress Tracking**: Always know which migrations have run

## Best Practices

1. **Never modify existing migrations** - Create new ones instead
2. **Use IF NOT EXISTS** - Make migrations idempotent when possible
3. **Test migrations** - Always test on a copy of production data first
4. **Small changes** - Keep migrations focused and atomic
5. **Document changes** - Use clear migration names and comments
6. **Backup first** - Always backup production data before running migrations
