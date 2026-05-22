import { conversationService } from '#server/database/conversations'
import { messageService } from '#server/database/conversation-messages'
import { jobQueueService } from '#server/database/job-queue'
import { userService } from '#server/database/users'
import { getIntParam, handleApiError } from '#server/utils/api-helpers'
import { htmlToText } from '#server/utils/inbox-mailgun'
import { storeInboxAttachment } from '#server/utils/inbox-attachments'
import { tiptapToHtml, tiptapToText } from '#server/utils/marketing-email-template'

async function readMessagePayload(event: any) {
  const contentType = getHeader(event, 'content-type') || ''
  if (!contentType.includes('multipart/form-data')) {
    return { body: await readBody<any>(event), files: [] as any[] }
  }

  const parts = await readMultipartFormData(event)
  const body: Record<string, any> = {}
  const files: any[] = []
  for (const part of parts || []) {
    if (part.filename) files.push(part)
    else if (part.name) body[part.name] = part.data?.toString('utf8') || ''
  }
  if (typeof body.saveDraft === 'string') body.saveDraft = body.saveDraft === 'true'
  if (typeof body.content_json === 'string' && body.content_json) {
    try { body.content_json = JSON.parse(body.content_json) } catch {}
  }
  return { body, files }
}

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'inbox.send')
  const id = getIntParam(event, 'id')
  const { body, files } = await readMessagePayload(event) as {
    body: {
    subject?: string
    body_html?: string
    body_text?: string
    content_json?: Record<string, any>
    saveDraft?: boolean
  },
    files: any[]
  }

  const renderedHtml = body.content_json ? tiptapToHtml(body.content_json) : body.body_html
  const renderedText = body.content_json ? tiptapToText(body.content_json) : body.body_text

  if (!renderedHtml && !renderedText) {
    throw createError({ statusCode: 400, statusMessage: 'Message body is required' })
  }

  try {
    const conversation = await conversationService.getById(id)
    if (!conversation) throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })

    const sender = await userService.getUserById(user.userId)
    const signature = sender?.email_signature ? `<br><br>${sender.email_signature}` : ''
    const html = `${renderedHtml || renderedText || ''}${signature}`
    const latestInbound = await messageService.latestInbound(id)

    const message = await messageService.create({
      conversation_id: id,
      direction: 'outbound',
      status: body.saveDraft ? 'draft' : 'queued',
      sender_user_id: user.userId,
      from_email: sender?.email_alias || null,
      from_name: sender?.display_name || user.email,
      subject: body.subject || conversation.subject || '(no subject)',
      body_html: html,
      body_stripped_html: html,
      body_text: renderedText || htmlToText(html),
      in_reply_to: latestInbound?.email_message_id || null,
      email_references: latestInbound?.email_message_id || null
    })

    for (const file of files) {
      await storeInboxAttachment({
        messageId: message.id,
        filename: file.filename,
        contentType: file.type,
        buffer: Buffer.from(file.data)
      })
    }

    if (!conversation.assigned_user_id) await conversationService.assign(id, user.userId)
    if (!body.saveDraft) {
      await jobQueueService.createJob('outbound_email', { message_id: message.id }, {
        referenceType: 'conversation_message',
        referenceId: message.id
      })
      await conversationService.touchLastMessage(id, 'outbound', 'pending')
    }

    logCreate('conversation_messages', String(message.id), event, { conversation_id: id })
    return { message }
  } catch (error) {
    handleApiError(error, 'Failed to create conversation message')
  }
})
