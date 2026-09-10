/**
 * Markdown export for context portfolios. A section exports as
 * `# {title}\n\n{content}`; a whole portfolio exports as one file per section
 * plus a README that indexes them.
 */

import { contextDb, type SqlClient, type ContextPortfolio } from '../../database/context-portfolios'
import { getPortfolioSections, type ContextSectionDefinition } from '../../database/context-sections'

export interface SectionExportFile {
  filename: string
  content: string
}

export function formatSectionMarkdown(title: string, content: string): string {
  return `# ${title}\n\n${content || ''}`
}

export function buildPortfolioReadme(
  portfolio: ContextPortfolio,
  definitions: ContextSectionDefinition[]
): string {
  const list = definitions
    .slice()
    .sort((a, b) => a.order - b.order)
    .map(d => `- \`${d.key}.md\` — ${d.description}`)
    .join('\n')

  const today = new Date().toISOString().slice(0, 10)
  return `# ${portfolio.name}

This is a context portfolio export — a structured set of markdown files designed to be read by AI tools, agents, and assistants.

## Files

${list}

## Usage

Drop these files into a Claude Project, expose them as MCP resources, or include them in any AI tool's context. They work anywhere markdown is understood.

These are living documents. Update them as your context changes.

*Exported from DOXA Context on ${today}*
`
}

export interface PortfolioExport {
  files: SectionExportFile[]
  readme: string
  safeFilename: string
}

/**
 * Build the full set of markdown files for a portfolio. The caller packs the
 * result; the README is always added last.
 */
export async function buildPortfolioExport(
  portfolio: ContextPortfolio,
  db?: SqlClient
): Promise<PortfolioExport> {
  const sql = contextDb(db)
  const definitions = await getPortfolioSections(portfolio.id, sql)
  const rows = await sql`
    SELECT section_key, content FROM context_sections WHERE portfolio_id = ${portfolio.id}
  ` as unknown as Array<{ section_key: string, content: string }>

  const byKey = new Map(rows.map(r => [r.section_key, r.content]))
  const files: SectionExportFile[] = definitions.map(definition => ({
    filename: `${definition.key}.md`,
    content: formatSectionMarkdown(definition.title, byKey.get(definition.key) ?? '')
  }))

  const rawName = (portfolio.name || 'portfolio').toLowerCase().replace(/\s+/g, '-')
  const safeFilename = rawName.replace(/[^a-z0-9._-]/g, '') || 'portfolio'

  return { files, readme: buildPortfolioReadme(portfolio, definitions), safeFilename }
}
