import postgres from 'postgres'
import { v4 as uuidv4 } from 'uuid'

let testDb: ReturnType<typeof postgres> | null = null

export function getTestDatabase() {
  if (testDb) return testDb

  const connectionString = process.env.TEST_DATABASE_URL

  if (!connectionString) {
    throw new Error(
      'TEST_DATABASE_URL environment variable is required for tests.\n' +
      'Create a test database branch and set TEST_DATABASE_URL in your .env file.\n' +
      'DO NOT run tests against your production database.'
    )
  }

  testDb = postgres(connectionString, {
    ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
    max: 5,
    idle_timeout: 10,
  })

  return testDb
}

export async function closeTestDatabase() {
  if (testDb) {
    await testDb.end()
    testDb = null
  }
}

export async function cleanupTestData(sql: ReturnType<typeof postgres>) {
  // Clean up test data created during tests
  // Delete in order respecting foreign key constraints

  // Clean adoption reports (depends on people_group_adoptions)
  await sql`DELETE FROM adoption_reports WHERE adoption_id IN (SELECT id FROM people_group_adoptions WHERE group_id IN (SELECT id FROM groups WHERE name LIKE 'Test %'))`

  // Clean people group adoptions (depends on groups and people_groups)
  await sql`DELETE FROM people_group_adoptions WHERE group_id IN (SELECT id FROM groups WHERE name LIKE 'Test %')`

  // Clean connections (depends on groups and subscribers)
  await sql`DELETE FROM connections WHERE (to_type = 'group' AND to_id IN (SELECT id FROM groups WHERE name LIKE 'Test %')) OR (from_type = 'subscriber' AND from_id IN (SELECT id FROM subscribers WHERE name LIKE 'Test %'))`

  // Clean comments on test groups and test subscribers
  await sql`DELETE FROM comments WHERE (record_type = 'group' AND record_id IN (SELECT id FROM groups WHERE name LIKE 'Test %')) OR (record_type = 'subscriber' AND record_id IN (SELECT id FROM subscribers WHERE name LIKE 'Test %'))`

  // Clean groups
  await sql`DELETE FROM groups WHERE name LIKE 'Test %'`

  // Clean library content and libraries (both test-named and people-group-linked)
  await sql`DELETE FROM library_content WHERE library_id IN (SELECT id FROM libraries WHERE name LIKE 'Test Library %' OR people_group_id IN (SELECT id FROM people_groups WHERE slug LIKE 'test-%'))`
  await sql`DELETE FROM campaign_library_config WHERE people_group_id IN (SELECT id FROM people_groups WHERE slug LIKE 'test-%')`
  await sql`DELETE FROM libraries WHERE name LIKE 'Test Library %' OR people_group_id IN (SELECT id FROM people_groups WHERE slug LIKE 'test-%')`

  // Clean people group-related data
  await sql`DELETE FROM reminder_emails_sent WHERE subscription_id IN (SELECT cs.id FROM campaign_subscriptions cs JOIN people_groups pg ON pg.id = cs.people_group_id WHERE pg.slug LIKE 'test-%')`
  await sql`DELETE FROM campaign_subscriptions WHERE people_group_id IN (SELECT id FROM people_groups WHERE slug LIKE 'test-%')`
  await sql`DELETE FROM contact_methods WHERE subscriber_id IN (SELECT id FROM subscribers WHERE name LIKE 'Test %')`

  // Clean other tables with people_group_id FK
  await sql`DELETE FROM prayer_content WHERE people_group_id IN (SELECT id FROM people_groups WHERE slug LIKE 'test-%')`
  await sql`DELETE FROM prayer_activity WHERE people_group_id IN (SELECT id FROM people_groups WHERE slug LIKE 'test-%')`
  await sql`DELETE FROM marketing_emails WHERE people_group_id IN (SELECT id FROM people_groups WHERE slug LIKE 'test-%')`

  // Clean user-people group access
  await sql`DELETE FROM campaign_users WHERE people_group_id IN (SELECT id FROM people_groups WHERE slug LIKE 'test-%')`
  await sql`DELETE FROM campaign_users WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'test-%@example.com')`

  await sql`DELETE FROM people_groups WHERE slug LIKE 'test-%'`
  await sql`DELETE FROM activity_logs WHERE metadata->>'email' LIKE 'test-%@example.com'`
  await sql`DELETE FROM subscribers WHERE name LIKE 'Test %'`

  // Clean user invitations (must be before users due to FK)
  await sql`DELETE FROM user_invitations WHERE email LIKE 'test-%@example.com'`
  await sql`DELETE FROM user_invitations WHERE invited_by IN (SELECT id FROM users WHERE email LIKE 'test-%@example.com')`

  // Clean marketing emails (must be before users due to FK)
  await sql`DELETE FROM marketing_emails WHERE created_by IN (SELECT id FROM users WHERE email LIKE 'test-%@example.com')`

  // Clean API keys
  await sql`DELETE FROM api_keys WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'test-%@example.com')`

  // Clean users last
  await sql`DELETE FROM users WHERE email LIKE 'test-%@example.com'`
}

export async function createTestPeopleGroup(
  sql: ReturnType<typeof postgres>,
  options: {
    title?: string
    slug?: string
  } = {}
) {
  const slugId = uuidv4().slice(0, 8)
  const title = options.title || `Test People Group ${slugId}`
  const slug = options.slug || `test-${slugId}`

  const result = await sql`
    INSERT INTO people_groups (name, slug)
    VALUES (${title}, ${slug})
    RETURNING id, slug, name as title
  `

  return result[0]
}

export async function createTestSubscriber(
  sql: ReturnType<typeof postgres>,
  options: {
    name?: string
  } = {}
) {
  const tracking_id = uuidv4()
  const profile_id = uuidv4()
  const name = options.name || 'Test Subscriber'

  const result = await sql`
    INSERT INTO subscribers (tracking_id, profile_id, name)
    VALUES (${tracking_id}, ${profile_id}, ${name})
    RETURNING id, tracking_id, profile_id, name
  `

  return result[0] as { id: number; tracking_id: string; profile_id: string; name: string }
}

export async function createTestContactMethod(
  sql: ReturnType<typeof postgres>,
  subscriberId: number,
  options: {
    type?: 'email' | 'phone'
    value?: string
    verified?: boolean
  } = {}
) {
  const type = options.type || 'email'
  const value = options.value || `test-${uuidv4().slice(0, 8)}@example.com`
  const verified = options.verified ?? false

  const result = await sql`
    INSERT INTO contact_methods (subscriber_id, type, value, verified)
    VALUES (${subscriberId}, ${type}, ${value}, ${verified})
    RETURNING id, subscriber_id, type, value, verified, verification_token, verification_token_expires_at
  `

  return result[0] as {
    id: number
    subscriber_id: number
    type: string
    value: string
    verified: boolean
    verification_token: string | null
    verification_token_expires_at: string | null
  }
}

export async function createTestPeopleGroupSubscription(
  sql: ReturnType<typeof postgres>,
  peopleGroupId: number,
  subscriberId: number,
  options: {
    delivery_method?: 'email' | 'whatsapp' | 'app'
    frequency?: string
    time_preference?: string
    timezone?: string
    status?: 'active' | 'inactive' | 'unsubscribed'
    days_of_week?: number[]
  } = {}
) {
  const delivery_method = options.delivery_method || 'email'
  const frequency = options.frequency || 'daily'
  const time_preference = options.time_preference || '09:00'
  const timezone = options.timezone || 'UTC'
  const status = options.status || 'active'
  const days_of_week = options.days_of_week ? JSON.stringify(options.days_of_week) : null

  const result = await sql`
    INSERT INTO campaign_subscriptions (
      people_group_id, subscriber_id, delivery_method, frequency,
      time_preference, timezone, status, days_of_week
    )
    VALUES (
      ${peopleGroupId}, ${subscriberId}, ${delivery_method}, ${frequency},
      ${time_preference}, ${timezone}, ${status}, ${days_of_week}
    )
    RETURNING id, people_group_id, subscriber_id, delivery_method, frequency,
              time_preference, timezone, status, days_of_week, next_reminder_utc
  `

  return result[0] as {
    id: number
    people_group_id: number
    subscriber_id: number
    delivery_method: string
    frequency: string
    time_preference: string
    timezone: string
    status: string
    days_of_week: string | null
    next_reminder_utc: string | null
  }
}

export async function getTestContactMethod(
  sql: ReturnType<typeof postgres>,
  subscriberId: number,
  type: 'email' | 'phone' = 'email'
) {
  const result = await sql`
    SELECT * FROM contact_methods
    WHERE subscriber_id = ${subscriberId} AND type = ${type}
  `
  return result[0] as {
    id: number
    subscriber_id: number
    type: string
    value: string
    verified: boolean
    verification_token: string | null
    verification_token_expires_at: string | null
    consent_doxa_general: boolean
    consented_people_group_ids: number[]
  } | undefined
}

export async function getTestSubscription(
  sql: ReturnType<typeof postgres>,
  peopleGroupId: number,
  subscriberId: number
) {
  const result = await sql`
    SELECT * FROM campaign_subscriptions
    WHERE people_group_id = ${peopleGroupId} AND subscriber_id = ${subscriberId}
    ORDER BY created_at DESC
    LIMIT 1
  `
  return result[0] as {
    id: number
    people_group_id: number
    subscriber_id: number
    delivery_method: string
    frequency: string
    time_preference: string
    timezone: string
    status: string
    days_of_week: string | null
    next_reminder_utc: string | null
  } | undefined
}

export async function getAllTestSubscriptions(
  sql: ReturnType<typeof postgres>,
  peopleGroupId: number,
  subscriberId: number
) {
  const result = await sql`
    SELECT * FROM campaign_subscriptions
    WHERE people_group_id = ${peopleGroupId} AND subscriber_id = ${subscriberId}
    ORDER BY created_at ASC
  `
  return result as Array<{
    id: number
    people_group_id: number
    subscriber_id: number
    delivery_method: string
    frequency: string
    time_preference: string
    timezone: string
    status: string
    days_of_week: string | null
    next_reminder_utc: string | null
  }>
}

export async function setVerificationToken(
  sql: ReturnType<typeof postgres>,
  contactMethodId: number,
  token: string,
  expiresAt: Date
) {
  await sql`
    UPDATE contact_methods
    SET verification_token = ${token},
        verification_token_expires_at = ${expiresAt.toISOString()}
    WHERE id = ${contactMethodId}
  `
}

export async function getTestSubscriberByEmail(
  sql: ReturnType<typeof postgres>,
  email: string
) {
  const result = await sql`
    SELECT s.* FROM subscribers s
    JOIN contact_methods cm ON cm.subscriber_id = s.id
    WHERE cm.type = 'email' AND LOWER(cm.value) = LOWER(${email})
  `
  return result[0] as { id: number; tracking_id: string; profile_id: string; name: string } | undefined
}

// Reminder-related test helpers

export async function setNextReminderUtc(
  sql: ReturnType<typeof postgres>,
  subscriptionId: number,
  nextReminderUtc: Date | null
) {
  if (nextReminderUtc === null) {
    await sql`
      UPDATE campaign_subscriptions
      SET next_reminder_utc = NULL
      WHERE id = ${subscriptionId}
    `
  } else {
    await sql`
      UPDATE campaign_subscriptions
      SET next_reminder_utc = ${nextReminderUtc.toISOString()}
      WHERE id = ${subscriptionId}
    `
  }
}

// User invitation helpers

export interface TestUserInvitation {
  id: number
  email: string
  token: string
  invited_by: string
  role: 'admin' | 'people_group_editor' | null
  status: 'pending' | 'accepted' | 'expired' | 'revoked'
  expires_at: string
}

export async function createTestUserInvitation(
  sql: ReturnType<typeof postgres>,
  options: {
    email?: string
    invited_by: string
    role?: 'admin' | 'people_group_editor' | null
    status?: 'pending' | 'accepted' | 'expired' | 'revoked'
    expires_in_days?: number
  }
): Promise<TestUserInvitation> {
  const email = options.email || `test-${uuidv4().slice(0, 8)}@example.com`
  const token = uuidv4()
  const role = options.role ?? null
  const status = options.status ?? 'pending'
  const expires_in_days = options.expires_in_days ?? 7

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + expires_in_days)

  const result = await sql`
    INSERT INTO user_invitations (email, token, invited_by, role, status, expires_at)
    VALUES (${email}, ${token}, ${options.invited_by}, ${role}, ${status}, ${expiresAt.toISOString()})
    RETURNING id, email, token, invited_by, role, status, expires_at
  `

  return result[0] as TestUserInvitation
}

export async function getTestUserInvitation(
  sql: ReturnType<typeof postgres>,
  id: number
): Promise<TestUserInvitation | null> {
  const result = await sql`
    SELECT id, email, token, invited_by, role, status, expires_at
    FROM user_invitations
    WHERE id = ${id}
  `
  return result[0] as TestUserInvitation | null
}

export async function getTestUserInvitationByEmail(
  sql: ReturnType<typeof postgres>,
  email: string
): Promise<TestUserInvitation | null> {
  const result = await sql`
    SELECT id, email, token, invited_by, role, status, expires_at
    FROM user_invitations
    WHERE email = ${email}
    ORDER BY created_at DESC
    LIMIT 1
  `
  return result[0] as TestUserInvitation | null
}

// People group access helpers

export async function assignUserToPeopleGroup(
  sql: ReturnType<typeof postgres>,
  userId: string,
  peopleGroupId: number
): Promise<void> {
  await sql`
    INSERT INTO campaign_users (user_id, people_group_id)
    VALUES (${userId}, ${peopleGroupId})
    ON CONFLICT DO NOTHING
  `
}

export async function removeUserFromPeopleGroup(
  sql: ReturnType<typeof postgres>,
  userId: string,
  peopleGroupId: number
): Promise<void> {
  await sql`
    DELETE FROM campaign_users
    WHERE user_id = ${userId} AND people_group_id = ${peopleGroupId}
  `
}

export async function getUserPeopleGroupAccess(
  sql: ReturnType<typeof postgres>,
  userId: string
): Promise<number[]> {
  const result = await sql`
    SELECT people_group_id FROM campaign_users
    WHERE user_id = ${userId}
  `
  return result.map((r: { people_group_id: number }) => r.people_group_id)
}

// Library helpers

export interface TestLibrary {
  id: number
  name: string
  description: string
  type: 'static' | 'people_group'
  repeating: boolean
  people_group_id: number | null
  library_key: string | null
}

export async function createTestLibrary(
  sql: ReturnType<typeof postgres>,
  options: {
    name?: string
    description?: string
    type?: 'static' | 'people_group'
    repeating?: boolean
    people_group_id?: number | null
    library_key?: string | null
  } = {}
): Promise<TestLibrary> {
  const name = options.name || `Test Library ${uuidv4().slice(0, 8)}`
  const description = options.description ?? ''
  const type = options.type ?? 'static'
  const repeating = options.repeating ?? false
  const people_group_id = options.people_group_id ?? null
  const library_key = options.library_key ?? null

  const result = await sql`
    INSERT INTO libraries (name, description, type, repeating, people_group_id, library_key)
    VALUES (${name}, ${description}, ${type}, ${repeating}, ${people_group_id}, ${library_key})
    RETURNING id, name, description, type, repeating, people_group_id, library_key
  `

  return result[0] as TestLibrary
}

export async function getTestLibrary(
  sql: ReturnType<typeof postgres>,
  id: number
): Promise<TestLibrary | null> {
  const result = await sql`
    SELECT id, name, description, type, repeating, people_group_id, library_key
    FROM libraries
    WHERE id = ${id}
  `
  return result[0] ?? null
}

// Library content helpers

export interface TestLibraryContent {
  id: number
  library_id: number
  day_number: number
  language_code: string
  content_json: Record<string, unknown> | null
}

export async function createTestLibraryContent(
  sql: ReturnType<typeof postgres>,
  libraryId: number,
  options: {
    day_number?: number
    language_code?: string
    content_json?: Record<string, unknown> | null
  } = {}
): Promise<TestLibraryContent> {
  const day_number = options.day_number ?? 1
  const language_code = options.language_code ?? 'en'
  const content_json = options.content_json ?? { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Test content' }] }] }

  const result = await sql`
    INSERT INTO library_content (library_id, day_number, language_code, content_json)
    VALUES (${libraryId}, ${day_number}, ${language_code}, ${JSON.stringify(content_json)})
    RETURNING id, library_id, day_number, language_code, content_json
  `

  return result[0] as TestLibraryContent
}

export async function getTestLibraryContent(
  sql: ReturnType<typeof postgres>,
  id: number
): Promise<TestLibraryContent | null> {
  const result = await sql`
    SELECT id, library_id, day_number, language_code, content_json
    FROM library_content
    WHERE id = ${id}
  `
  return result[0] ?? null
}

// User helpers

export async function getTestUser(
  sql: ReturnType<typeof postgres>,
  id: string
) {
  const result = await sql`
    SELECT id, email, display_name, verified, superadmin, role
    FROM users
    WHERE id = ${id}
  `
  return result[0] as {
    id: string
    email: string
    display_name: string
    verified: boolean
    superadmin: boolean
    role: string | null
  } | null
}

export async function getTestUserByEmail(
  sql: ReturnType<typeof postgres>,
  email: string
) {
  const result = await sql`
    SELECT id, email, display_name, verified, superadmin, role
    FROM users
    WHERE email = ${email}
  `
  return result[0] as {
    id: string
    email: string
    display_name: string
    verified: boolean
    superadmin: boolean
    role: string | null
  } | null
}

// Group helpers

export interface TestGroup {
  id: number
  name: string
  primary_subscriber_id: number | null
  country: string | null
}

export async function createTestGroup(
  sql: ReturnType<typeof postgres>,
  options: {
    name?: string
    primary_subscriber_id?: number | null
    country?: string | null
  } = {}
): Promise<TestGroup> {
  const name = options.name || `Test Group ${uuidv4().slice(0, 8)}`
  const primary_subscriber_id = options.primary_subscriber_id ?? null
  const country = options.country ?? null

  const result = await sql`
    INSERT INTO groups (name, primary_subscriber_id, country)
    VALUES (${name}, ${primary_subscriber_id}, ${country})
    RETURNING id, name, primary_subscriber_id, country
  `

  return result[0] as TestGroup
}

export async function createTestConnection(
  sql: ReturnType<typeof postgres>,
  options: {
    from_type: string
    from_id: number
    to_type: string
    to_id: number
    connection_type?: string | null
  }
) {
  const result = await sql`
    INSERT INTO connections (from_type, from_id, to_type, to_id, connection_type)
    VALUES (${options.from_type}, ${options.from_id}, ${options.to_type}, ${options.to_id}, ${options.connection_type ?? null})
    RETURNING id, from_type, from_id, to_type, to_id, connection_type
  `
  return result[0] as {
    id: number
    from_type: string
    from_id: number
    to_type: string
    to_id: number
    connection_type: string | null
  }
}

export interface TestAdoption {
  id: number
  people_group_id: number
  group_id: number
  status: string
  update_token: string
  show_publicly: boolean
  adopted_at: string | null
}

export async function createTestAdoption(
  sql: ReturnType<typeof postgres>,
  groupId: number,
  peopleGroupId: number,
  options: {
    status?: 'pending' | 'active' | 'inactive'
    show_publicly?: boolean
  } = {}
): Promise<TestAdoption> {
  const status = options.status ?? 'active'
  const show_publicly = options.show_publicly ?? false
  const adopted_at = status === 'active' ? new Date().toISOString() : null

  const result = await sql`
    INSERT INTO people_group_adoptions (people_group_id, group_id, status, show_publicly, adopted_at)
    VALUES (${peopleGroupId}, ${groupId}, ${status}, ${show_publicly}, ${adopted_at})
    RETURNING id, people_group_id, group_id, status, update_token, show_publicly, adopted_at
  `

  return result[0] as TestAdoption
}

export interface TestAdoptionReport {
  id: number
  adoption_id: number
  praying_count: number | null
  stories: string | null
  comments: string | null
  status: string
  submitted_at: string
}

export async function createTestAdoptionReport(
  sql: ReturnType<typeof postgres>,
  adoptionId: number,
  options: {
    praying_count?: number | null
    stories?: string | null
    comments?: string | null
    status?: 'submitted' | 'approved' | 'rejected'
  } = {}
): Promise<TestAdoptionReport> {
  const praying_count = options.praying_count ?? null
  const stories = options.stories ?? null
  const comments = options.comments ?? null
  const status = options.status ?? 'submitted'

  const result = await sql`
    INSERT INTO adoption_reports (adoption_id, praying_count, stories, comments, status)
    VALUES (${adoptionId}, ${praying_count}, ${stories}, ${comments}, ${status})
    RETURNING id, adoption_id, praying_count, stories, comments, status, submitted_at
  `

  return result[0] as TestAdoptionReport
}
