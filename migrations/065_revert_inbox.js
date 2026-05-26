class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class RevertInboxMigration extends BaseMigration {
  id = 65
  name = 'Revert shared inbox tables from migration 64'

  async up(sql) {
    await this.exec(sql, `ALTER TABLE users DROP COLUMN IF EXISTS email_signature`)
    await this.exec(sql, `ALTER TABLE users DROP COLUMN IF EXISTS email_alias`)
    await this.exec(sql, `DROP TABLE IF EXISTS spam_senders`)
    await this.exec(sql, `DROP TABLE IF EXISTS canned_response_translations`)
    await this.exec(sql, `DROP TABLE IF EXISTS canned_responses`)
    await this.exec(sql, `DROP TABLE IF EXISTS conversation_attachments`)
    await this.exec(sql, `DROP TABLE IF EXISTS conversation_messages`)
    await this.exec(sql, `DROP TABLE IF EXISTS conversations`)
  }
}
