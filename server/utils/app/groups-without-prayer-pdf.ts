import { PDFDocument, PDFName, PDFString, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { getSql } from '../../database/db'
import { formatPeopleGroup } from './people-group-formatter'

export interface GroupWithoutPrayer {
  name: string
  slug: string
  country: string
  population: number
  religion: string
}

/**
 * Active people groups with no active prayer commitment (no one signed up to
 * pray for them), largest population first. Matches the inverse of
 * "People groups with prayer" in the weekly activity email, minus archived groups.
 */
export async function getGroupsWithoutPrayer(): Promise<GroupWithoutPrayer[]> {
  const sql = getSql()
  const rows = await sql`
    SELECT pg.*
    FROM people_groups pg
    WHERE pg.status != 'archived'
      AND NOT EXISTS (
        SELECT 1 FROM campaign_subscriptions cs
        WHERE cs.people_group_id = pg.id AND cs.status = 'active'
      )
    ORDER BY pg.population DESC NULLS LAST, pg.name
  ` as any[]

  const label = (v: unknown) => (v && typeof v === 'object' && 'label' in v ? String((v as any).label ?? '') : '')

  return rows.map((pg) => {
    const f = formatPeopleGroup(pg, { fields: 'all', lang: 'en' })
    return {
      name: pg.name,
      slug: pg.slug,
      country: label(f.country_code),
      population: Number(pg.population) || 0,
      religion: label(f.religion)
    }
  })
}

const PAGE_W = 612
const PAGE_H = 792
const MARGIN_X = 54
const TOP = 50
const BOTTOM = 58
const FONT_SIZE = 9
const LINE_H = 11
const PAD_Y = 4

const ACCENT = rgb(0.706, 0.278, 0.169)
const MUTE = rgb(0.42, 0.42, 0.42)
const TEXT = rgb(0.1, 0.1, 0.1)
const LINE = rgb(0.9, 0.9, 0.9)

const COLUMNS = [
  { key: 'n', label: '#', width: 32, align: 'right' },
  { key: 'name', label: 'PEOPLE GROUP', width: 155, align: 'left' },
  { key: 'country', label: 'COUNTRY', width: 108, align: 'left' },
  { key: 'population', label: 'POPULATION', width: 72, align: 'right' },
  { key: 'religion', label: 'RELIGION', width: 137, align: 'left' }
] as const
const COL_GAP = 8

/** Standard PDF fonts only cover WinAnsi; strip accents from anything else. */
function safe(font: PDFFont, text: string): string {
  try {
    font.encodeText(text)
    return text
  } catch {
    return [...text.normalize('NFD').replace(/[̀-ͯ]/g, '')]
      .map((ch) => {
        try { font.encodeText(ch); return ch } catch { return '?' }
      })
      .join('')
  }
}

function wrap(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (!current || font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next
    } else {
      lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines.length ? lines : ['']
}

function addLink(doc: PDFDocument, page: PDFPage, url: string, x: number, y: number, w: number, h: number) {
  const annot = doc.context.register(doc.context.obj({
    Type: 'Annot',
    Subtype: 'Link',
    Rect: [x, y, x + w, y + h],
    Border: [0, 0, 0],
    A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) }
  }))
  const existing = page.node.Annots()
  if (existing) existing.push(annot)
  else page.node.set(PDFName.of('Annots'), doc.context.obj([annot]))
}

export async function buildGroupsWithoutPrayerPdf(groups: GroupWithoutPrayer[], siteUrl: string, generatedAt = new Date()): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle('Groups Without Prayer')
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const base = siteUrl.replace(/\/+$/, '')

  const colX: number[] = []
  let x = MARGIN_X
  for (const col of COLUMNS) {
    colX.push(x)
    x += col.width + COL_GAP
  }
  const tableRight = x - COL_GAP

  let page = doc.addPage([PAGE_W, PAGE_H])
  let y = PAGE_H - TOP

  // Title and summary (first page only)
  page.drawText('Groups Without Prayer', { x: MARGIN_X, y: y - 20, size: 20, font: bold, color: TEXT })
  y -= 34
  const total = groups.reduce((sum, g) => sum + g.population, 0)
  const date = generatedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  const summary = `${groups.length.toLocaleString('en-US')} people groups with no one signed up to pray for them, about ${total.toLocaleString('en-US')} people in total. Generated ${date}. Sorted by population.`
  for (const line of wrap(font, summary, 10, tableRight - MARGIN_X)) {
    page.drawText(line, { x: MARGIN_X, y: y - 10, size: 10, font, color: MUTE })
    y -= 13
  }
  y -= 14

  const drawHeader = () => {
    COLUMNS.forEach((col, i) => {
      const w = bold.widthOfTextAtSize(col.label, 7.5)
      const cx = col.align === 'right' ? colX[i]! + col.width - w : colX[i]!
      page.drawText(col.label, { x: cx, y: y - 10, size: 7.5, font: bold, color: MUTE })
    })
    y -= 16
    page.drawLine({ start: { x: MARGIN_X, y }, end: { x: tableRight, y }, thickness: 0.5, color: LINE })
  }
  drawHeader()

  groups.forEach((g, idx) => {
    const values: Record<string, string> = {
      n: String(idx + 1),
      name: safe(font, g.name),
      country: safe(font, g.country),
      population: g.population.toLocaleString('en-US'),
      religion: safe(font, g.religion)
    }
    const cells = COLUMNS.map(col => wrap(font, values[col.key]!, FONT_SIZE, col.width))
    const rowH = Math.max(...cells.map(c => c.length)) * LINE_H + PAD_Y * 2

    if (y - rowH < BOTTOM) {
      page = doc.addPage([PAGE_W, PAGE_H])
      y = PAGE_H - TOP
      drawHeader()
    }

    COLUMNS.forEach((col, i) => {
      const color = col.key === 'name' ? ACCENT : col.key === 'n' ? MUTE : TEXT
      cells[i]!.forEach((line, li) => {
        const w = font.widthOfTextAtSize(line, FONT_SIZE)
        const cx = col.align === 'right' ? colX[i]! + col.width - w : colX[i]!
        page.drawText(line, { x: cx, y: y - PAD_Y - FONT_SIZE - li * LINE_H, size: FONT_SIZE, font, color })
      })
    })

    const nameW = Math.min(COLUMNS[1].width, Math.max(...cells[1]!.map(l => font.widthOfTextAtSize(l, FONT_SIZE))))
    addLink(doc, page, `${base}/${encodeURIComponent(g.slug)}`, colX[1]!, y - rowH + PAD_Y, nameW, rowH - PAD_Y * 2)

    y -= rowH
    page.drawLine({ start: { x: MARGIN_X, y }, end: { x: tableRight, y }, thickness: 0.5, color: LINE })
  })

  const pages = doc.getPages()
  pages.forEach((p, i) => {
    const label = `Page ${i + 1} of ${pages.length}`
    p.drawText(label, { x: tableRight - font.widthOfTextAtSize(label, 8), y: 36, size: 8, font, color: MUTE })
  })

  return doc.save()
}
