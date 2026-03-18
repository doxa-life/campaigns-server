import { t } from './translations'

/**
 * Convert Tiptap JSON content to plain HTML for email.
 */
export function tiptapToHtml(contentJson: string | null): string {
  if (!contentJson) return ''

  try {
    const doc = JSON.parse(contentJson)
    if (!doc || !doc.content) return ''

    return renderNodes(doc.content)
  } catch {
    return ''
  }
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
      const rawLevel = node.attrs?.level
      const level = (typeof rawLevel === 'number' && rawLevel >= 1 && rawLevel <= 6) ? rawLevel : 2
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

    case 'taskList':
      const tlContent = node.content ? renderNodes(node.content) : ''
      return `<ul style="margin: 16px 0; padding-left: 0; list-style: none;">${tlContent}</ul>`

    case 'taskItem':
      const tiContent = node.content ? renderNodes(node.content) : ''
      const checked = node.attrs?.checked ? '&#9745;' : '&#9744;'
      return `<li style="margin: 8px 0;">${checked} ${tiContent}</li>`

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

    case 'image':
      const src = escapeHtml(node.attrs?.src || '')
      const alt = escapeHtml(node.attrs?.alt || '')
      return `<img src="${src}" alt="${alt}" style="max-width: 100%; height: auto; margin: 16px 0; border-radius: 4px;" />`

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
            case 'highlight':
              text = `<mark style="background: #ffff00;">${text}</mark>`
              break
            case 'textStyle':
              if (mark.attrs?.color) {
                text = `<span style="color: ${escapeHtml(mark.attrs.color)};">${text}</span>`
              }
              break
          }
        }
      }
      return text

    default:
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
export function tiptapToText(contentJson: string | null): string {
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
      if (['paragraph', 'heading', 'listItem', 'blockquote', 'taskItem'].includes(node.type)) {
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

/**
 * Render a complete marketing email HTML with header and footer.
 */
export function renderMarketingEmailHtml(
  contentJson: string,
  peopleGroupName?: string,
  unsubscribeUrl?: string,
  locale: string = 'en'
): string {
  const config = useRuntimeConfig()
  const appName = config.appName || 'Prayer Tools'
  const baseUrl = config.public.siteUrl || 'http://localhost:3000'

  const contentHtml = tiptapToHtml(contentJson)

  const headerTitle = peopleGroupName
    ? t('email.marketing.headerCampaign', locale, { campaign: peopleGroupName })
    : t('email.marketing.headerDefault', locale, { appName })
  const footer = t('email.marketing.footer', locale, { appName })
  const unsubscribeText = t('email.common.unsubscribe', locale)

  return `
    <!DOCTYPE html>
    <html lang="${locale}">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${headerTitle}</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #3B463D; background: #ffffff; max-width: 600px; margin: 0 auto; padding: 20px;">
      <img src="${baseUrl}/images/template-header-doxa.jpeg" alt="Doxa" style="width: 100%; display: block; border-radius: 10px 10px 0 0;" />
      <div style="background: #3B463D; color: #ffffff; padding: 30px; text-align: center;">
        <h1 style="margin: 0; font-size: 28px; font-weight: 500;">${headerTitle}</h1>
      </div>

      <div style="background: #ffffff; border: 2px solid #3B463D; border-top: none; padding: 40px 30px; border-radius: 0 0 10px 10px;">
        ${contentHtml}
      </div>

      <div style="text-align: center; margin-top: 20px; padding: 20px; color: #666666; font-size: 12px;">
        <p style="margin: 0 0 10px;">${footer}</p>
        ${unsubscribeUrl ? `<p style="margin: 0;"><a href="${unsubscribeUrl}" style="color: #666666; text-decoration: underline;">${unsubscribeText}</a></p>` : ''}
      </div>
    </body>
    </html>
  `
}
