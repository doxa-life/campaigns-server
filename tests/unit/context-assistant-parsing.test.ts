import { describe, expect, it } from 'vitest'
import { parseSse, splitStreamingReply } from '~/utils/context-assistant-stream'

async function* chunks(...parts: string[]) {
  for (const part of parts) yield part
}

async function collect<T>(source: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = []
  for await (const item of source) out.push(item)
  return out
}

describe('parseSse', () => {
  it('reads named events split across chunk boundaries', async () => {
    const frames = await collect(parseSse(chunks(
      'event: status\ndata: {"text":"Rea',
      'ding Team…"}\n\nevent: delta\ndata: {"text":"Hi"}\n\n'
    )))

    expect(frames).toEqual([
      { event: 'status', data: '{"text":"Reading Team…"}' },
      { event: 'delta', data: '{"text":"Hi"}' }
    ])
  })

  it('ignores keep-alive comment lines and joins multi-line data', async () => {
    const frames = await collect(parseSse(chunks(': keep-alive\n\ndata: one\ndata: two\n\n')))
    expect(frames).toEqual([{ event: 'message', data: 'one\ntwo' }])
  })

  it('yields a trailing frame that never got its blank line', async () => {
    const frames = await collect(parseSse(chunks('event: done\ndata: {}')))
    expect(frames).toEqual([{ event: 'done', data: '{}' }])
  })
})

describe('splitStreamingReply', () => {
  it('keeps prose and hides a completed update block', () => {
    const reply = [
      'Adding the new hire.',
      '```section-update',
      'PORTFOLIO: doxa',
      'SECTION_KEY: team',
      'SECTION_TITLE: Team',
      '---',
      'Ada joined in March.',
      '```',
      'Let me know if that reads right.'
    ].join('\n')

    const { visible, drafting } = splitStreamingReply(reply)
    expect(visible).toBe('Adding the new hire.\n\nLet me know if that reads right.')
    expect(drafting).toEqual(['Team'])
  })

  it('reports a block still streaming, titled as soon as the title line lands', () => {
    const partial = 'Updating.\n```section-update\nPORTFOLIO: doxa\nSECTION_KEY: team\nSECTION_TITLE: Team\n---\nAda jo'
    const { visible, drafting } = splitStreamingReply(partial)
    expect(visible).toBe('Updating.')
    expect(drafting).toEqual(['Team'])
  })

  it('reports an untitled block before its title line arrives', () => {
    const { drafting } = splitStreamingReply('Working.\n```section-update\nPORTFOLIO: do')
    expect(drafting).toEqual([''])
  })

  it('handles several blocks in one reply', () => {
    const reply = [
      'Two changes.',
      '```section-update',
      'SECTION_KEY: team',
      'SECTION_TITLE: Team',
      '---',
      'a',
      '```',
      '```section-update',
      'SECTION_KEY: glossary',
      'SECTION_TITLE: Glossary',
      '---',
      'b',
      '```'
    ].join('\n')

    const { visible, drafting } = splitStreamingReply(reply)
    expect(visible).toBe('Two changes.')
    expect(drafting).toEqual(['Team', 'Glossary'])
  })

  it('leaves a reply with no update blocks untouched', () => {
    expect(splitStreamingReply('Just an answer.')).toEqual({ visible: 'Just an answer.', drafting: [] })
  })
})
