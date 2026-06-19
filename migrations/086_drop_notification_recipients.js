class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class DropNotificationRecipients extends BaseMigration {
  id = 86
  name = 'Drop notification_recipients table (recipients now live on users.notification_preferences)'

  async up(sql) {
    await this.exec(sql, `DROP TABLE IF EXISTS notification_recipients`)
  }

  async down(sql) {
    await this.exec(sql, `
      CREATE TABLE IF NOT EXISTS notification_recipients (
        id SERIAL PRIMARY KEY,
        group_key VARCHAR(50) NOT NULL,
        email VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(group_key, email)
      )
    `)
  }
}
