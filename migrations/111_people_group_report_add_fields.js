class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class PeopleGroupReportAddFieldsMigration extends BaseMigration {
  id = 111
  name = 'Store the proposed completion fields on an add report'

  async up(sql) {
    // An "add" report creates a people group, which needs fields the submitter
    // is never asked for. They are proposed once the reporter verifies their
    // email and kept here so reviewers can correct them before approving:
    // { values, ai, metadata, source, generated_at, error, edited_by, edited_at }.
    // `values` is what the apply uses; `ai` is the proposal as generated, so a
    // field a reviewer has changed is the one where the two differ.
    await this.exec(sql, `
      ALTER TABLE people_group_reports
      ADD COLUMN IF NOT EXISTS add_fields JSONB NOT NULL DEFAULT '{}'::jsonb
    `)
  }
}
