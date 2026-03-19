import { t, localePath } from './translations'

export interface PrayerReminderEmailData {
  to: string
  subscriberName: string
  peopleGroupName: string
  peopleGroupSlug: string
  trackingId: string
  profileId: string
  subscriptionId: number
  prayerDuration: number
  prayerContent: Array<{
    content_json: Record<string, any> | null
  }> | null
  locale?: string
}

/**
 * Convert Tiptap JSON content to plain HTML for email.
 * This is a simplified converter that handles common Tiptap node types.
 */
function tiptapToHtml(contentJson: Record<string, any> | null): string {
  if (!contentJson || !contentJson.content) return ''
  return renderNodes(contentJson.content)
}

function renderNodes(nodes: any[]): string {
  return nodes.map(node => renderNode(node)).join('')
}

function renderNode(node: any): string {
  if (!node) return ''

  switch (node.type) {
    case 'paragraph':
      const pContent = node.content ? renderNodes(node.content) : ''
      return `<p style="margin: 16px 0; font-size: 16px; line-height: 1.6; color: #3B463D;">${pContent}</p>`

    case 'heading':
      const level = node.attrs?.level || 2
      const hContent = node.content ? renderNodes(node.content) : ''
      const sizes: Record<number, string> = { 1: '24px', 2: '20px', 3: '18px', 4: '16px', 5: '14px', 6: '12px' }
      return `<h${level} style="margin: 24px 0 16px; font-size: ${sizes[level] || '18px'}; font-weight: 600; color: #3B463D;">${hContent}</h${level}>`

    case 'bulletList':
      const ulContent = node.content ? renderNodes(node.content) : ''
      return `<ul style="margin: 16px 0; padding-left: 24px;">${ulContent}</ul>`

    case 'orderedList':
      const olContent = node.content ? renderNodes(node.content) : ''
      return `<ol style="margin: 16px 0; padding-left: 24px;">${olContent}</ol>`

    case 'listItem':
      const liContent = node.content ? renderNodes(node.content) : ''
      return `<li style="margin: 8px 0;">${liContent}</li>`

    case 'blockquote':
      const bqContent = node.content ? renderNodes(node.content) : ''
      return `<blockquote style="margin: 16px 0; padding: 12px 20px; border-left: 4px solid #3B463D; background: #f5f5f5; font-style: italic;">${bqContent}</blockquote>`

    case 'codeBlock':
      const codeContent = node.content ? renderNodes(node.content) : ''
      return `<pre style="margin: 16px 0; padding: 16px; background: #f5f5f5; border-radius: 4px; overflow-x: auto;"><code>${codeContent}</code></pre>`

    case 'horizontalRule':
      return `<hr style="margin: 24px 0; border: none; border-top: 1px solid #cccccc;" />`

    case 'hardBreak':
      return '<br />'

    case 'text':
      let text = escapeHtml(node.text || '')
      if (node.marks) {
        for (const mark of node.marks) {
          switch (mark.type) {
            case 'bold':
              text = `<strong>${text}</strong>`
              break
            case 'italic':
              text = `<em>${text}</em>`
              break
            case 'underline':
              text = `<u>${text}</u>`
              break
            case 'strike':
              text = `<s>${text}</s>`
              break
            case 'superscript':
              text = `<sup>${text}</sup>`
              break
            case 'link':
              const href = escapeHtml(mark.attrs?.href || '#')
              text = `<a href="${href}" style="color: #3B463D; text-decoration: underline;">${text}</a>`
              break
          }
        }
      }
      return text

    default:
      // For unknown nodes, try to render their content
      if (node.content) {
        return renderNodes(node.content)
      }
      return ''
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Convert Tiptap JSON content to plain text for email.
 */
function tiptapToText(contentJson: string | null): string {
  if (!contentJson) return ''

  try {
    const doc = JSON.parse(contentJson)
    if (!doc || !doc.content) return ''

    return extractText(doc.content).trim()
  } catch {
    return ''
  }
}

function extractText(nodes: any[]): string {
  return nodes.map(node => {
    if (node.type === 'text') {
      return node.text || ''
    }
    if (node.content) {
      const text = extractText(node.content)
      // Add newlines for block elements
      if (['paragraph', 'heading', 'listItem', 'blockquote'].includes(node.type)) {
        return text + '\n'
      }
      return text
    }
    if (node.type === 'hardBreak') {
      return '\n'
    }
    return ''
  }).join('')
}

export async function sendPrayerReminderEmail(data: PrayerReminderEmailData): Promise<boolean> {
  const config = useRuntimeConfig()
  const baseUrl = config.public.siteUrl || 'http://localhost:3000'
  const appName = config.appName || 'Prayer Tools'
  const locale = data.locale || 'en'

  const unsubscribeUrl = `${baseUrl}${localePath('/unsubscribe', locale)}?slug=${data.peopleGroupSlug}&id=${data.profileId}&sid=${data.subscriptionId}`
  const profileUrl = `${baseUrl}${localePath('/subscriber', locale)}?id=${data.profileId}`
  const prayerFuelUrl = `${baseUrl}${localePath(`/${data.peopleGroupSlug}/prayer`, locale)}?uid=${data.trackingId}`

  const subject = t('email.reminder.subject', locale, { campaign: data.peopleGroupName })
  const header = t('email.reminder.header', locale)
  const hello = t('email.common.hello', locale, { name: data.subscriberName })
  const timeForPrayer = t('email.reminder.timeForPrayer', locale, { duration: data.prayerDuration })
  const viewPrayer = t('email.reminder.viewPrayer', locale)
  const automatedReminder = t('email.reminder.automatedReminder', locale, { appName })
  const managePreferences = t('email.common.managePreferences', locale)
  const unsubscribe = t('email.common.unsubscribe', locale)

  // Build content HTML - just a reminder with link to prayer fuel
  const contentHtml = `
    <p style="font-size: 16px; margin: 20px 0; color: #3B463D;">
      ${timeForPrayer}
    </p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${prayerFuelUrl}" style="
        background: #3B463D;
        color: #ffffff;
        padding: 15px 30px;
        text-decoration: none;
        border-radius: 5px;
        font-weight: 500;
        font-size: 16px;
        display: inline-block;
        text-align: center;
        border: 2px solid #3B463D;
      ">${viewPrayer}</a>
    </div>
  `
  const contentText = `${timeForPrayer}\n\n${viewPrayer}:\n${prayerFuelUrl}\n\n`

  const html = `
    <!DOCTYPE html>
    <html lang="${locale}">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #3B463D; background: #ffffff; max-width: 600px; margin: 0 auto; padding: 20px;">
      <img src="${baseUrl}/images/template-header-doxa.jpeg" alt="Doxa" style="width: 100%; display: block; border-radius: 10px 10px 0 0;" />
      <div style="background: #3B463D; color: #ffffff; padding: 30px; text-align: center;">
        <h1 style="margin: 0; font-size: 28px; font-weight: 500;">${header}</h1>
        <p style="margin: 10px 0 0; font-size: 16px; opacity: 0.8;">${data.peopleGroupName}</p>
      </div>

      <div style="background: #ffffff; border: 2px solid #3B463D; border-top: none; padding: 40px 30px; border-radius: 0 0 10px 10px;">
        <h2 style="color: #3B463D; margin-top: 0; font-weight: 500;">${hello}</h2>

        ${contentHtml}
      </div>

      <div style="text-align: center; margin-top: 20px; padding: 20px; color: #666666; font-size: 12px;">
        <p style="margin: 0 0 10px;">${automatedReminder}</p>
        <p style="margin: 0;">
          <a href="${profileUrl}" style="color: #666666; text-decoration: underline;">${managePreferences}</a>
          &nbsp;|&nbsp;
          <a href="${unsubscribeUrl}" style="color: #666666; text-decoration: underline;">${unsubscribe}</a>
        </p>
      </div>
    </body>
    </html>
  `

  const text = `
${subject}

${hello}

${contentText}
---
${automatedReminder}
${managePreferences}: ${profileUrl}
${unsubscribe}: ${unsubscribeUrl}
  `.trim()

  return await sendEmail({
    to: data.to,
    subject,
    html,
    text
  })
}
