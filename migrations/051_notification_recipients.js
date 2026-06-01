class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class NotificationRecipientsMigration extends BaseMigration {
  id = 51
  name = 'Create notification_recipients table for configurable email notifications'

  async up(sql) {
    await this.exec(sql, `
      CREATE TABLE notification_recipients (
        id SERIAL PRIMARY KEY,
        group_key VARCHAR(50) NOT NULL,
        email VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(group_key, email)
      )
    `)
  }

  async down(sql) {
    await this.exec(sql, `DROP TABLE IF EXISTS notification_recipients`)
  }
}
