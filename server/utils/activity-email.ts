import type { ActivityStats } from './activity-email-stats'

type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly'

interface StatRow {
  label: string
  value: string
  change: number | null
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remaining = minutes % 60
  if (remaining === 0) return `${hours}h`
  return `${hours}h ${remaining}m`
}

function formatChange(current: number, previous: number): number | null {
  return current - previous
}

function changeHtml(change: number | null | undefined): string {
  if (change === null || change === undefined) return ''
  if (change === 0) return '<span style="color: #666; font-size: 13px;">no change</span>'
  const color = change > 0 ? '#16a34a' : '#dc2626'
  const prefix = change > 0 ? '+' : ''
  return `<span style="color: ${color}; font-size: 13px;">${prefix}${change}</span>`
}

function changeDurationHtml(change: number | null | undefined): string {
  if (change === null || change === undefined) return ''
  if (change === 0) return '<span style="color: #666; font-size: 13px;">no change</span>'
  const color = change > 0 ? '#16a34a' : '#dc2626'
  const prefix = change > 0 ? '+' : ''
  return `<span style="color: ${color}; font-size: 13px;">${prefix}${formatDuration(Math.abs(change))}</span>`
}

function changeText(change: number | null | undefined): string {
  if (change === null || change === undefined) return ''
  if (change === 0) return '(no change)'
  const prefix = change > 0 ? '+' : ''
  return `(${prefix}${change})`
}

function changeDurationText(change: number | null | undefined): string {
  if (change === null || change === undefined) return ''
  if (change === 0) return '(no change)'
  const prefix = change > 0 ? '+' : ''
  return `(${prefix}${formatDuration(Math.abs(change))})`
}

function buildStatRows(stats: ActivityStats, previousStats: ActivityStats | null): StatRow[] {
  const unsubscribed = previousStats?.totalSubscribers != null
    ? Math.max(0, previousStats.totalSubscribers + stats.newSubscribers - stats.totalSubscribers)
    : null

  return [
    {
      label: 'New subscribers',
      value: String(stats.newSubscribers),
      change: null
    },
    {
      label: 'Unsubscribed',
      value: unsubscribed != null ? String(unsubscribed) : '—',
      change: null
    },
    {
      label: 'Total subscribers',
      value: String(stats.totalSubscribers),
      change: previousStats?.totalSubscribers != null ? formatChange(stats.totalSubscribers, previousStats.totalSubscribers) : null
    },
    {
      label: 'Prayer time committed',
      value: formatDuration(stats.prayerCommitted),
      change: previousStats ? formatChange(stats.prayerCommitted, previousStats.prayerCommitted) : null
    },
    {
      label: 'Prayer time recorded',
      value: formatDuration(stats.totalPrayerTime),
      change: previousStats ? formatChange(stats.totalPrayerTime, previousStats.totalPrayerTime) : null
    },
    {
      label: 'People groups with prayer',
      value: String(stats.groupsWithPrayer),
      change: previousStats ? formatChange(stats.groupsWithPrayer, previousStats.groupsWithPrayer) : null
    },
    {
      label: 'People groups with 144 subscribers',
      value: String(stats.groupsWith144),
      change: previousStats ? formatChange(stats.groupsWith144, previousStats.groupsWith144) : null
    },
    {
      label: 'People groups adopted',
      value: String(stats.groupsAdopted),
      change: previousStats ? formatChange(stats.groupsAdopted, previousStats.groupsAdopted) : null
    },
    {
      label: 'People groups engaged',
      value: String(stats.groupsEngaged),
      change: previousStats ? formatChange(stats.groupsEngaged, previousStats.groupsEngaged) : null
    }
  ]
}

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function getFrequencyTheme(frequency: Frequency) {
  switch (frequency) {
    case 'weekly':
      return { color: '#1e40af', light: '#dbeafe', border: '#93c5fd' }
    case 'monthly':
      return { color: '#b4ada3', light: '#f5f3f0', border: '#d4cfc9' }
    default:
      return { color: '#3B463D', light: '#f0fdf4', border: '#86efac' }
  }
}

function getWeeklyVisualHtml(): string {
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  const dots = days.map(d =>
    `<td style="text-align: center; padding: 0 4px;">
      <div style="width: 32px; height: 32px; border-radius: 50%; background: rgba(255,255,255,0.2); color: #ffffff; font-size: 12px; font-weight: 600; line-height: 32px; text-align: center;">${d}</div>
    </td>`
  ).join('')
  return `
    <table style="margin: 16px auto 0; border-collapse: collapse;">
      <tr>${dots}</tr>
    </table>
  `
}

function getMonthlyVisualHtml(stats: ActivityStats): string {
  const now = new Date()
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const monthName = prevMonth.toLocaleString('en-US', { month: 'long' })
  const year = prevMonth.getFullYear()
  return `
    <div style="margin: 16px auto 0; text-align: center;">
      <div style="display: inline-block; background: rgba(255,255,255,0.15); border-radius: 10px; padding: 10px 28px; border: 1px solid rgba(255,255,255,0.3);">
        <div style="font-size: 28px; font-weight: 700; letter-spacing: 1px;">${monthName}</div>
        <div style="font-size: 14px; opacity: 0.8; margin-top: 2px;">${year}</div>
      </div>
    </div>
  `
}

export async function sendActivityEmail(
  to: string,
  frequency: Frequency,
  stats: ActivityStats,
  previousStats: ActivityStats | null
): Promise<boolean> {
  const config = useRuntimeConfig()
  const baseUrl = config.public.siteUrl || 'http://localhost:3000'
  const appName = config.appName || 'DOXA Prayer'

  const freqLabel = capitalizeFirst(frequency)
  const subject = `${appName} ${freqLabel} Activity Summary`
  const profileUrl = `${baseUrl}/admin/profile`
  const rows = buildStatRows(stats, previousStats)
  const theme = getFrequencyTheme(frequency)

  let frequencyVisual = ''
  if (frequency === 'weekly') frequencyVisual = getWeeklyVisualHtml()
  else if (frequency === 'monthly') frequencyVisual = getMonthlyVisualHtml(stats)

  const tableRowsHtml = rows.map((row, i) => {
    const isDuration = row.label.toLowerCase().includes('prayer time')
    const changeVal: number | null = row.change ?? null
    const changeCell = changeVal !== null
      ? (isDuration ? changeDurationHtml(changeVal) : changeHtml(changeVal))
      : ''
    const bgColor = i % 2 === 0 ? '#f9fafb' : '#ffffff'
    return `
      <tr style="background: ${bgColor};">
        <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #374151;">${row.label}</td>
        <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 16px; font-weight: 600; color: #111827; text-align: right;">${row.value}</td>
        <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; text-align: right; min-width: 80px;">${changeCell}</td>
      </tr>
    `
  }).join('')

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #3B463D; background: #ffffff; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: ${theme.color}; color: #ffffff; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="margin: 0; font-size: 24px; font-weight: 500;">${freqLabel} Activity Summary</h1>
        <p style="margin: 8px 0 0; font-size: 14px; opacity: 0.8;">${appName}</p>
        ${frequencyVisual}
      </div>

      <div style="background: #ffffff; border: 2px solid ${theme.color}; border-top: none; padding: 30px; border-radius: 0 0 10px 10px;">
        <table style="width: 100%; border-collapse: collapse; margin: 0;">
          <thead>
            <tr>
              <th style="padding: 10px 16px; text-align: left; font-size: 12px; text-transform: uppercase; color: #6b7280; border-bottom: 2px solid #e5e7eb;">Metric</th>
              <th style="padding: 10px 16px; text-align: right; font-size: 12px; text-transform: uppercase; color: #6b7280; border-bottom: 2px solid #e5e7eb;">Value</th>
              <th style="padding: 10px 16px; text-align: right; font-size: 12px; text-transform: uppercase; color: #6b7280; border-bottom: 2px solid #e5e7eb;">Change</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
        </table>
      </div>

      <div style="text-align: center; margin-top: 20px; padding: 20px; color: #666666; font-size: 12px;">
        <p style="margin: 0 0 10px;">This is an automated ${frequency} activity summary from ${appName}.</p>
        <p style="margin: 0;">
          <a href="${profileUrl}" style="color: #666666; text-decoration: underline;">Manage email preferences</a>
        </p>
      </div>
    </body>
    </html>
  `

  const textRows = rows.map(row => {
    const isDuration = row.label.toLowerCase().includes('prayer time')
    const ch = row.change ?? null
    const change = ch !== null
      ? (isDuration ? changeDurationText(ch) : changeText(ch))
      : ''
    return `${row.label}: ${row.value} ${change}`.trim()
  }).join('\n')

  const text = `
${subject}

${textRows}

---
This is an automated ${frequency} activity summary from ${appName}.
Manage email preferences: ${profileUrl}
  `.trim()

  return await sendEmail({
    to,
    subject,
    html,
    text
  })
}
