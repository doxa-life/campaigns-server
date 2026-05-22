/// <reference lib="dom" />

/**
 * Pasted-HTML cleanup for Tiptap editors, mirroring the normalization in
 * RichTextEditor.vue so pasted content (Word, Google Docs, other emails,
 * WordPress) conforms to the editor's allowed feature set. `maxHeadingLevel`
 * lets a caller cap heading depth — the inbox composer only allows H1/H2,
 * so it passes 2; the library editor allows H1–H3.
 */

import { DOMParser as ProseMirrorDOMParser } from '@tiptap/pm/model'

export interface PasteCleanupOptions {
  maxHeadingLevel?: number
}

function transformPastedHTML(html: string, options: PasteCleanupOptions = {}): string {
  const maxHeadingLevel = options.maxHeadingLevel ?? 3
  const container = document.createElement('div')
  container.innerHTML = html

  container.querySelectorAll('meta, style, script, noscript').forEach((el) => el.remove())

  container.querySelectorAll('.wp-block-spacer, [aria-hidden="true"]').forEach((el) => el.remove())

  container.querySelectorAll('.section-header').forEach((div) => {
    const heading = div.querySelector('h1, h2, h3, h4, h5, h6')
    if (heading) {
      div.replaceWith(heading)
    }
  })

  container.querySelectorAll('figure').forEach((figure) => {
    const img = figure.querySelector('img')
    if (img) {
      figure.replaceWith(img)
    }
  })

  container.querySelectorAll('mark').forEach((mark) => {
    const span = document.createElement('span')
    span.innerHTML = mark.innerHTML
    mark.replaceWith(span)
  })

  container.querySelectorAll('.gb-notice-title, .gb-notice-text, .wp-block-genesis-blocks-gb-notice').forEach((div) => {
    const fragment = document.createDocumentFragment()
    while (div.firstChild) {
      fragment.appendChild(div.firstChild)
    }
    div.replaceWith(fragment)
  })

  container.querySelectorAll('div.wp-block-image, div[class^="wp-block"]').forEach((div) => {
    const hasBlockContent = div.querySelector('p, h1, h2, h3, h4, h5, h6, ul, ol, img, blockquote')
    if (hasBlockContent || div.children.length === 0) {
      const fragment = document.createDocumentFragment()
      while (div.firstChild) {
        fragment.appendChild(div.firstChild)
      }
      div.replaceWith(fragment)
    }
  })

  const allElements = container.querySelectorAll('*')
  allElements.forEach((el) => {
    const attrsToRemove: string[] = []
    for (const attr of el.attributes) {
      if (
        attr.name.startsWith('data-v-')
        || attr.name.startsWith('data-react')
        || attr.name.startsWith('data-ng-')
        || attr.name.startsWith('ng-')
        || attr.name.startsWith('_ngcontent')
        || attr.name.startsWith('_nghost')
      ) {
        attrsToRemove.push(attr.name)
      }
    }
    attrsToRemove.forEach((attr) => el.removeAttribute(attr))

    if (el.tagName === 'SPAN') {
      const style = (el as HTMLElement).style
      if (style.fontWeight === 'bold' || style.fontWeight === '700' || style.fontWeight === '600') {
        const strong = document.createElement('strong')
        strong.innerHTML = el.innerHTML
        el.replaceWith(strong)
      } else if (style.fontStyle === 'italic') {
        const em = document.createElement('em')
        em.innerHTML = el.innerHTML
        el.replaceWith(em)
      }
    }

    if (el.tagName === 'B') {
      const strong = document.createElement('strong')
      strong.innerHTML = el.innerHTML
      el.replaceWith(strong)
    }

    if (el.tagName === 'I' && !el.classList.contains('icon')) {
      const em = document.createElement('em')
      em.innerHTML = el.innerHTML
      el.replaceWith(em)
    }
  })

  container.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((heading) => {
    heading.removeAttribute('class')

    const level = parseInt(heading.tagName.charAt(1), 10)
    if (level > maxHeadingLevel) {
      const replacement = document.createElement(`h${maxHeadingLevel}`)
      replacement.innerHTML = heading.innerHTML
      heading.replaceWith(replacement)
    }
  })

  container.querySelectorAll('ul, ol, li').forEach((el) => {
    el.removeAttribute('class')
    el.removeAttribute('style')
  })

  container.querySelectorAll('a').forEach((link) => {
    const href = link.getAttribute('href')
    while (link.attributes.length > 0) {
      const attr = link.attributes[0]
      if (attr) link.removeAttribute(attr.name)
    }
    if (href) {
      link.setAttribute('href', href)
    }
  })

  container.querySelectorAll('p').forEach((p) => {
    p.removeAttribute('class')
    const style = p.getAttribute('style')
    if (style && !style.includes('text-align')) {
      p.removeAttribute('style')
    }
  })

  container.querySelectorAll('span:empty, div:empty').forEach((el) => {
    if (!el.hasChildNodes()) {
      el.remove()
    }
  })

  return container.innerHTML
}

/**
 * Build a ProseMirror `handlePaste` that runs pasted HTML through
 * transformPastedHTML before inserting it. Returns false (default paste)
 * when there's no HTML payload (e.g. plain-text paste).
 */
export function createPasteHandler(options: PasteCleanupOptions = {}) {
  return (view: any, event: ClipboardEvent): boolean => {
    const clipboardData = event.clipboardData
    if (!clipboardData) return false

    const html = clipboardData.getData('text/html')
    if (!html) return false

    const cleanedHTML = transformPastedHTML(html, options)

    const { state, dispatch } = view
    const parser = ProseMirrorDOMParser.fromSchema(state.schema)
    const container = document.createElement('div')
    container.innerHTML = cleanedHTML

    const slice = parser.parseSlice(container)
    const tr = state.tr.replaceSelection(slice)
    dispatch(tr)

    return true
  }
}
