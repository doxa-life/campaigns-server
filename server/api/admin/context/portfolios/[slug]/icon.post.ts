import { getPortfolioBySlugOr404, updatePortfolio } from '#server/database/context-portfolios'
import { uploadPublicImage } from '#server/utils/app/public-image-storage'
import { handleApiError } from '#server/utils/api-helpers'

/**
 * POST /api/admin/context/portfolios/:slug/icon — upload a portfolio icon.
 * Multipart form field: `file`. The image goes to the public bucket, so the
 * stored URL is stable and safe to render anywhere.
 */
export default defineEventHandler(async (event) => {
  const auth = await requirePermission(event, 'context.edit')
  const portfolio = await getPortfolioBySlugOr404(getRouterParam(event, 'slug') ?? '')

  const parts = await readMultipartFormData(event)
  const file = parts?.find(part => part.name === 'file' && part.filename)
  if (!file || !file.data || file.data.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No "file" field in upload' })
  }

  try {
    const { url } = await uploadPublicImage(file.data)
    const updated = await updatePortfolio(portfolio.id, { icon_url: url })
    logUpdate('context_portfolios', portfolio.id, auth.userId, { icon_url: url })
    return updated
  } catch (error) {
    handleApiError(error, 'Failed to upload portfolio icon')
  }
})
