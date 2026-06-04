class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class DropMarketingSenderDefaultMigration extends BaseMigration {
  id = 77
  name = 'Drop marketing sender default flag'

  async up(sql) {
    console.log('📥 Dropping marketing sender default flag...')

    // The "default sender" concept was removed: senders are chosen explicitly per
    // email (auto-selected only when exactly one exists). Drop the now-unused flag
    // and its single-default uniqueness index.
    await this.exec(sql, `DROP INDEX IF EXISTS uq_marketing_senders_default`)
    await this.exec(sql, `ALTER TABLE marketing_senders DROP COLUMN IF EXISTS is_default`)

    console.log('  ✅ Removed is_default from marketing_senders')
    console.log('🎉 Marketing sender default flag migration completed!')
  }
}
