/**
 * Verse Extension for TipTap
 * A styled block for scripture or quoted verses with optional Bible verse lookup
 */

import { Node, mergeAttributes } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import VerseNode from '~/components/VerseNode.vue'

export interface VerseOptions {
  HTMLAttributes: Record<string, any>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    verse: {
      setVerse: (attrs?: { reference?: string }) => ReturnType
      toggleVerse: () => ReturnType
    }
  }
}

export const Verse = Node.create<VerseOptions>({
  name: 'verse',

  group: 'block',

  content: 'block+',

  draggable: true,

  addOptions() {
    return {
      HTMLAttributes: {}
    }
  },

  addAttributes() {
    return {
      reference: {
        default: null,
        parseHTML: element => element.getAttribute('data-reference'),
        renderHTML: attributes => {
          if (!attributes.reference) return {}
          return { 'data-reference': attributes.reference }
        }
      },
      translation: {
        default: null,
        parseHTML: element => element.getAttribute('data-translation'),
        renderHTML: attributes => {
          if (!attributes.translation) return {}
          return { 'data-translation': attributes.translation }
        }
      }
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="verse"]'
      }
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(
        {
          'data-type': 'verse'
        },
        this.options.HTMLAttributes,
        HTMLAttributes
      ),
      0
    ]
  },

  addNodeView() {
    return VueNodeViewRenderer(VerseNode)
  },

  addCommands() {
    return {
      setVerse: (attrs) => ({ commands }) => {
        return commands.wrapIn(this.name, attrs)
      },
      toggleVerse: () => ({ commands }) => {
        return commands.toggleWrap(this.name)
      }
    }
  }
})

export default Verse
