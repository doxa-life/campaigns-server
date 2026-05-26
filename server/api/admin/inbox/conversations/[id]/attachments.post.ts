import { messageService } from '#server/database/conversation-messages'
import { conversationAttachmentService } from '#server/database/conversation-attachments'
import { getIntParam, handleApiError } from '#server/utils/api-helpers'

const BLOCKED = /\.(exe|bat|cmd|com|scr|js|jar|vbs|ps1|sh|msi|dll)$/i
const MAX_BYTES = 25 * 1024 * 1024

/**
 * Upload an attachment for an outbound draft message (multipart: file + draft_id).
 * The draft must exist first (Save Draft); files are re-attached when the draft is sent.
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'inbox.send')

  const conversationId = getIntParam(event, 'id')
  const parts = await readMultipartFormData(event)
  if (!parts) {
    throw createError({ statusCode: 400, statusMessage: 'No file uploaded' })
  }

  const draftIdPart = parts.find(p => p.name === 'draft_id')
  const filePart = parts.find(p => p.name === 'file' && p.filename)
  const draftId = draftIdPart?.data ? parseInt(draftIdPart.data.toString(), 10) : NaN

  if (Number.isNaN(draftId)) {
    throw createError({ statusCode: 400, statusMessage: 'draft_id is required' })
  }
  if (!filePart || !filePart.filename) {
    throw createError({ statusCode: 400, statusMessage: 'file is required' })
  }
  if (BLOCKED.test(filePart.filename)) {
    throw createError({ statusCode: 400, statusMessage: 'File type not allowed' })
  }
  if (filePart.data.length > MAX_BYTES) {
    throw createError({ statusCode: 400, statusMessage: 'File exceeds 25 MB' })
  }

  const draft = await messageService.getById(draftId)
  if (!draft || draft.status !== 'draft' || draft.conversation_id !== conversationId) {
    throw createError({ statusCode: 404, statusMessage: 'Draft not found' })
  }

  try {
    const upload = await uploadToS3(filePart.data, filePart.filename, filePart.type || 'application/octet-stream')
    const attachment = await conversationAttachmentService.create({
      message_id: draftId,
      s3_key: upload.key,
      filename: filePart.filename,
      content_type: filePart.type || null,
      size_bytes: filePart.data.length,
    })
    return { attachment }
  } catch (error) {
    handleApiError(error, 'Failed to upload attachment')
  }
})
