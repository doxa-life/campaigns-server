class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }

  async tableExists(sql, table) {
    const result = await sql`
      SELECT 1 FROM information_schema.tables WHERE table_name = ${table}
    `
    return result.length > 0
  }
}

export default class LanguageRolloutsMigration extends BaseMigration {
  id = 116
  name = 'Language rollouts and their task states'

  async up(sql) {
    // One row per language being put into code, started by /add-language-everywhere.
    // `status_report` is the latest language-status survey the skill posted.
    if (!(await this.tableExists(sql, 'language_rollouts'))) {
      await this.exec(sql, `
        CREATE TABLE language_rollouts (
          code TEXT PRIMARY KEY REFERENCES glossary_languages(code) ON DELETE CASCADE,
          started_by UUID REFERENCES users(id) ON DELETE SET NULL,
          started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          status_report JSONB,
          status_report_at TIMESTAMPTZ
        )
      `)
    }

    // Only tasks that have moved off "pending" have a row; the task list and
    // its labels live in config/language-rollout-tasks.ts.
    if (!(await this.tableExists(sql, 'language_rollout_tasks'))) {
      await this.exec(sql, `
        CREATE TABLE language_rollout_tasks (
          code TEXT NOT NULL REFERENCES language_rollouts(code) ON DELETE CASCADE,
          task_key TEXT NOT NULL,
          state TEXT NOT NULL CHECK (state IN ('running', 'done', 'failed', 'skipped')),
          note TEXT NOT NULL DEFAULT '',
          updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (code, task_key)
        )
      `)
    }
  }

  async down(sql) {
    await this.exec(sql, `DROP TABLE IF EXISTS language_rollout_tasks`)
    await this.exec(sql, `DROP TABLE IF EXISTS language_rollouts`)
  }
}
