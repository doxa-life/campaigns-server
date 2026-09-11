import { describe, it, expect } from 'vitest'
import { mapCsvRow } from '../../server/utils/app/imb-sync'

const baseRow = { PEID: 'P1', DisplayName: 'Test Group' }

describe('IMB CSV row mapping', () => {
  it('lowercases region so it matches the region option keys', () => {
    expect(mapCsvRow({ ...baseRow, UNm49RegionName: 'Asia' })?.region).toBe('asia')
    expect(mapCsvRow({ ...baseRow, Regn: 'Americas' })?.region).toBe('americas')
  })

  it('stores null when the export has no region', () => {
    expect(mapCsvRow({ ...baseRow })?.region).toBeNull()
    expect(mapCsvRow({ ...baseRow, UNm49RegionName: '' })?.region).toBeNull()
  })
})
