import { contextTransaction, getPortfolioBySlugOr404 } from '#server/database/context-portfolios'
import { saveSectionContent } from '#server/database/context-sections'
import {
  getOwnedConversationOr404,
  getMessageInConversation,
  setProposalStatus
} from '#server/database/context-assistant'
import { roleService } from '#server/database/roles'
import { handleApiError } from '#server/utils/api-helpers'

/**
 * POST /api/admin/context/assistant/conversations/:id/proposals
 * Decide one proposed section update: { message_id, index, action } where
 * action is 'apply' or 'reject'. Applying writes through the same section
 * writer as a manual edit, so the size limit and version history are identical.
 */
export default defineEventHandler(async (event) => {
  const auth = await requirePermission(event, 'context.view')
  const conversation = await getOwnedConversationOr404(getRouterParam(event, 'id') ?? '', auth.userId)

  const body = await readBody<{ message_id?: string, index?: number, action?: string }>(event)
  const messageId = String(body?.message_id || '')
  const index = Number(body?.index)
  const action = String(body?.action || '')

  if (!messageId || !Number.isInteger(index) || index < 0 || (action !== 'apply' && action !== 'reject')) {
    throw createError({ statusCode: 400, statusMessage: 'message_id, index, and action ("apply" or "reject") are required' })
  }

  const message = await getMessageInConversation(conversation.id, messageId)
  const proposal = message?.proposals[index]
  if (!message || !proposal) {
    throw createError({ statusCode: 404, statusMessage: 'Proposal not found' })
  }
  if (proposal.status !== 'pending') {
    throw createError({ statusCode: 409, statusMessage: `Proposal already ${proposal.status}` })
  }

  if (action === 'reject') {
    const proposals = await setProposalStatus(message, index, 'rejected')
    return { proposal: proposals[index] }
  }

  if (!(await roleService.userHasPermission(auth.userId, 'context.edit'))) {
    throw createError({ statusCode: 403, statusMessage: 'Permission required: context.edit' })
  }

  const portfolio = await getPortfolioBySlugOr404(proposal.portfolio_slug)

  try {
    const result = await contextTransaction(async (tx) => {
      const saved = await saveSectionContent(
        portfolio.id, proposal.section_key, proposal.proposed_content, auth.userId, { source: 'assistant' }, tx
      )
      const proposals = await setProposalStatus(message, index, 'applied', tx)
      return { saved, proposals }
    })

    logUpdate('context_sections', result.saved.section.id, auth.userId, {
      source: 'assistant',
      portfolio_id: portfolio.id,
      key: proposal.section_key,
      version_id: result.saved.versionId
    })

    return { proposal: result.proposals[index], version_id: result.saved.versionId }
  } catch (error) {
    handleApiError(error, 'Failed to apply the proposed update')
  }
})
