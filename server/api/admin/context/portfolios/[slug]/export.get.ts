import archiver from 'archiver'
import { getPortfolioBySlugOr404 } from '#server/database/context-portfolios'
import { buildPortfolioExport } from '#server/utils/context/export'

/** GET /api/admin/context/portfolios/:slug/export — the whole portfolio as a zip of markdown files. */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'context.view')
  const portfolio = await getPortfolioBySlugOr404(getRouterParam(event, 'slug') ?? '')
  const { files, readme, safeFilename } = await buildPortfolioExport(portfolio)

  setHeader(event, 'Content-Type', 'application/zip')
  setHeader(event, 'Content-Disposition', `attachment; filename="${safeFilename}.zip"`)

  const archive = archiver('zip', { zlib: { level: 9 } })
  const chunks: Buffer[] = []
  archive.on('data', (chunk: Buffer) => chunks.push(chunk))
  const done = new Promise<Buffer>((resolve, reject) => {
    archive.on('end', () => resolve(Buffer.concat(chunks)))
    archive.on('error', reject)
  })

  for (const file of files) archive.append(file.content, { name: file.filename })
  archive.append(readme, { name: 'README.md' })
  await archive.finalize()

  return await done
})
