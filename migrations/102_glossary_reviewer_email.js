class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class GlossaryReviewerEmailMigration extends BaseMigration {
  id = 102
  name = 'Record the reviewer email on a glossary review pass'

  async up(sql) {
    // Reviewers work through a magic link rather than an account, so their
    // email is the only way to come back to them about a flagged term.
    await this.exec(sql, `
      ALTER TABLE glossary_review_passes
      ADD COLUMN IF NOT EXISTS reviewer_email TEXT
    `)
  }
}
