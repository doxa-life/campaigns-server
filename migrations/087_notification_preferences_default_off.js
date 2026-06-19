class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class NotificationPreferencesDropDefault extends BaseMigration {
  id = 87
  name = 'Drop notification_preferences column default (defaults are now code-owned)'

  // Stop baking notification defaults into the schema. New users get NULL and the app
  // resolves their preferences against DEFAULT_NOTIFICATION_PREFERENCES in code, so
  // changing a default or adding a preference is a code change — never a migration.
  // Existing rows (seeded by migration 085) keep their explicit values.
  async up(sql) {
    await this.exec(sql, `ALTER TABLE users ALTER COLUMN notification_preferences DROP DEFAULT`)
  }

  async down(sql) {
    await this.exec(sql, `
      ALTER TABLE users
      ALTER COLUMN notification_preferences
      SET DEFAULT '{"stats":{"daily":true,"weekly":true,"monthly":true,"yearly":true},"adoption":false,"contact_us":false}'
    `)
  }
}
