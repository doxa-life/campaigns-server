/**
 * RFC 4180 CSV parser: handles quoted fields containing commas, quotes and
 * newlines. Returns one object per data row keyed by the trimmed header; empty
 * cells are omitted so a missing value reads as undefined.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows = parseCsvRows(text)
  const header = rows.shift()
  if (!header) return []
  return rows.map((r) => {
    const obj: Record<string, string> = {}
    header.forEach((col, idx) => {
      const value = (r[idx] ?? '').trim()
      if (value !== '') obj[col.trim()] = value
    })
    return obj
  })
}

/** Column names from the first row of a CSV, trimmed. */
export function parseCsvHeader(text: string): string[] {
  return (parseCsvRows(text)[0] ?? []).map(h => h.trim())
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else {
      field += char
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    if (row.length > 1 || row[0] !== '') rows.push(row)
  }
  return rows
}
