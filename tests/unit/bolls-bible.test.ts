import { describe, it, expect } from 'vitest'
import { cleanVerseText } from '../../server/utils/app/bolls-bible'

describe('cleanVerseText', () => {
  it('removes Hebrew-numbering markers at the start and middle of a verse', () => {
    expect(cleanVerseText('(H30:3) Jos joku tekee lupauksen Herralle'))
      .toBe('Jos joku tekee lupauksen Herralle')
    expect(cleanVerseText('Veisuunjohtajalle; kielisoittimilla; virsi, laulu. (H67:2) Jumala olkoon meille armollinen'))
      .toBe('Veisuunjohtajalle; kielisoittimilla; virsi, laulu. Jumala olkoon meille armollinen')
  })

  it('removes Greek-numbering and malformed markers', () => {
    expect(cleanVerseText('(G12:18) Ja se asettui seisomaan meren hiekalle. (G13:1) Ja minä näin pedon'))
      .toBe('Ja se asettui seisomaan meren hiekalle. Ja minä näin pedon')
    expect(cleanVerseText('(/:14) Lemmenmarjat tuoksuavat')).toBe('Lemmenmarjat tuoksuavat')
  })

  it('removes a chapter heading left at the end of a verse', () => {
    expect(cleanVerseText('vaimo kantakoon syyllisyytensä." 6:')).toBe('vaimo kantakoon syyllisyytensä."')
    expect(cleanVerseText('ne eivät tunne. Halleluja! 148 PSALMI.')).toBe('ne eivät tunne. Halleluja!')
  })

  it('leaves ordinary verse text alone', () => {
    const verse = 'Kameleja heillä oli neljäsataa kolmekymmentä viisi, -Sela-'
    expect(cleanVerseText(verse)).toBe(verse)
    expect(cleanVerseText('The LORD <i>is</i> my shepherd')).toBe('The LORD is my shepherd')
  })
})
