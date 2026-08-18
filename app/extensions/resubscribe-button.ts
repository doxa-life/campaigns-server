/**
 * Resubscribe Button Extension for TipTap
 *
 * A block-level call-to-action button for marketing emails. The inline content
 * is the button label (editable in place); the destination is not stored here —
 * the email send pipeline substitutes each recipient's personal reactivation
 * link when rendering, and drops the button for recipients without one.
 */

import { Node, mergeAttributes } from '@tiptap/core'

export interface ResubscribeButtonOptions {
  HTMLAttributes: Record<string, any>
  defaultLabel: string
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    resubscribeButton: {
      /**
       * Insert a resubscribe button node
       */
      setResubscribeButton: () => ReturnType
    }
  }
}

export const ResubscribeButton = Node.create<ResubscribeButtonOptions>({
  name: 'resubscribeButton',

  group: 'block',

  content: 'inline*',

  draggable: true,

  addOptions() {
    return {
      HTMLAttributes: {},
      defaultLabel: 'Restart my prayer reminders'
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="resubscribe-button"]'
      }
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(
        {
          'data-type': 'resubscribe-button',
          'style': 'text-align: center; margin: 28px 0;'
        },
        this.options.HTMLAttributes,
        HTMLAttributes
      ),
      [
        'span',
        {
          'style': 'display: inline-block; background: #3B463D; color: #ffffff; padding: 14px 28px; border-radius: 8px; font-size: 16px; font-weight: 600;'
        },
        0
      ]
    ]
  },

  addCommands() {
    return {
      setResubscribeButton: () => ({ commands }) => {
        return commands.insertContent({
          type: this.name,
          content: [{ type: 'text', text: this.options.defaultLabel }]
        })
      }
    }
  }
})

export default ResubscribeButton
