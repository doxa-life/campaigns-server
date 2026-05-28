#!/usr/bin/env bun
/**
 * One-off: send the daily activity stats email to a specific address.
 * Bypasses the cron lock and uses the latest stored ACTIVITY_EMAIL_SENT
 * stats as "previous" for change comparisons.
 *
 * Usage: bun run scripts/send-daily-stats-email.ts <to-email>
 */
import postgres from 'postgres'
import nodemailer from 'nodemailer'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))

function loadEnv() {
  const envPath = join(projectRoot, '.env')
  const content = readFileSync(envPath, 'utf-8')
  for (const raw of content.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const key = line.slice(0, eq).trim()
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[key]) process.env[key] = value
  }
}
loadEnv()

const to = process.argv[2]
if (!to) {
  console.error('Usage: bun run scripts/send-daily-stats-email.ts <to-email>')
  process.exit(1)
}

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL not set')

const sqlClient = postgres(databaseUrl, {
  ssl: databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false },
  max: 5,
})

;(globalThis as any).sql = sqlClient
;(globalThis as any).useRuntimeConfig = () => ({
  public: { siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000' },
  appName: process.env.APP_NAME || 'DOXA Prayer',
})
;(globalThis as any).sendEmail = async (opts: { to: string; subject: string; html: string; text?: string }) => {
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
  })
  const fromName = process.env.SMTP_FROM_NAME || process.env.APP_NAME || 'DOXA Prayer'
  const fromAddr = process.env.SMTP_FROM || 'noreply@doxa.life'
  const info = await transport.sendMail({
    from: `${fromName} <${fromAddr}>`,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  })
  console.log('SMTP sent:', info.messageId)
  return true
}

const { sendActivityEmail } = await import('../server/utils/activity-email')

const now = new Date()
const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
const periodStart = new Date(periodEnd)
periodStart.setUTCDate(periodStart.getUTCDate() - 1)

console.log(`Period: ${periodStart.toISOString()} → ${periodEnd.toISOString()}`)

async function collectActivityStats(start: Date, end: Date) {
  const startIso = start.toISOString()
  const endIso = end.toISOString()
  const sql = sqlClient
  const [
    subscribersRow,
    totalSubscribersRow,
    prayerTimeRow,
    prayerCommittedRow,
    groupsWithPrayerRow,
    groupsWith144Row,
    groupsAdoptedRow,
    groupsEngagedRow
  ] = await Promise.all([
    sql`
      SELECT COUNT(DISTINCT s.id) as count
      FROM subscribers s
      JOIN contact_methods cm ON cm.subscriber_id = s.id AND cm.type = 'email' AND cm.verified = true
      JOIN campaign_subscriptions cs ON cs.subscriber_id = s.id AND cs.status = 'active' AND cs.people_group_id IS NOT NULL
      WHERE s.created_at >= ${startIso} AND s.created_at < ${endIso}
    `.then(rows => rows[0]),
    sql`
      SELECT COUNT(DISTINCT s.id) as count
      FROM subscribers s
      JOIN contact_methods cm ON cm.subscriber_id = s.id AND cm.type = 'email' AND cm.verified = true
      JOIN campaign_subscriptions cs ON cs.subscriber_id = s.id AND cs.status = 'active' AND cs.people_group_id IS NOT NULL
    `.then(rows => rows[0]),
    sql`SELECT COALESCE(ROUND(SUM(duration) / 60.0), 0) as total FROM prayer_activity WHERE timestamp >= ${startIso} AND timestamp < ${endIso}`.then(rows => rows[0]),
    sql`
      SELECT COALESCE(SUM(daily_committed), 0) as total
      FROM (
        SELECT d.date, SUM(cs.prayer_duration) as daily_committed
        FROM generate_series(${startIso}::date, (${endIso}::date - INTERVAL '1 day'), '1 day'::interval) as d(date)
        JOIN campaign_subscriptions cs
          ON cs.status = 'active'
          AND cs.created_at::date <= d.date
        GROUP BY d.date
      ) daily_totals
    `.then(rows => rows[0]),
    sql`SELECT COUNT(DISTINCT people_group_id) as count FROM campaign_subscriptions WHERE status = 'active'`.then(rows => rows[0]),
    sql`SELECT COUNT(*) as count FROM (SELECT people_group_id FROM campaign_subscriptions WHERE status = 'active' GROUP BY people_group_id HAVING COUNT(*) >= 144) sub`.then(rows => rows[0]),
    sql`SELECT COUNT(*) as count FROM people_group_adoptions WHERE status = 'active'`.then(rows => rows[0]),
    sql`SELECT COUNT(*) as count FROM people_groups WHERE engagement_status = 'engaged'`.then(rows => rows[0])
  ])
  return {
    newSubscribers: Number(subscribersRow?.count ?? 0),
    totalSubscribers: Number(totalSubscribersRow?.count ?? 0),
    totalPrayerTime: Number(prayerTimeRow?.total ?? 0),
    prayerCommitted: Math.round(Number(prayerCommittedRow?.total ?? 0)),
    groupsWithPrayer: Number(groupsWithPrayerRow?.count ?? 0),
    groupsWith144: Number(groupsWith144Row?.count ?? 0),
    groupsAdopted: Number(groupsAdoptedRow?.count ?? 0),
    groupsEngaged: Number(groupsEngagedRow?.count ?? 0)
  }
}

const stats = await collectActivityStats(periodStart, periodEnd)
console.log('Current stats:', stats)

const [prev] = await sqlClient`
  SELECT metadata FROM activity_logs
  WHERE event_type = 'ACTIVITY_EMAIL_SENT'
    AND metadata->>'frequency' = 'daily'
    AND metadata->'stats' IS NOT NULL
  ORDER BY timestamp DESC
  LIMIT 1
`
const previousStats = prev?.metadata?.stats ?? null
console.log('Previous stats:', previousStats)

await sendActivityEmail(to, 'daily', stats, previousStats)
console.log(`✅ Sent daily stats email to ${to}`)

await sqlClient.end()
