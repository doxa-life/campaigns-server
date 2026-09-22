class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class DropSuperadminMigration extends BaseMigration {
  id = 113
  name = 'Retire the superadmin flag in favour of the admin role'

  async up(sql) {
    // The flag sat outside the role system entirely, so a user could hold it
    // without holding `admin`. Grant the role first, or those accounts lose
    // every surface the flag used to open.
    const promoted = await sql`
      UPDATE users
      SET roles = array_append(roles, 'admin'), updated = NOW()
      WHERE superadmin = TRUE AND NOT ('admin' = ANY(roles))
      RETURNING email
    `
    for (const { email } of promoted) {
      console.log(`  Granted the admin role to ${email}`)
    }

    await this.exec(sql, `ALTER TABLE users DROP COLUMN IF EXISTS superadmin`)
  }
}
