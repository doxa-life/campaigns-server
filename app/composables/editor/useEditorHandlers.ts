/**
 * Custom Editor Handlers for UEditor
 * Provides handlers for verse, spacer, and video
 */

import type { Editor } from '@tiptap/core'
import { textColors, highlightColors } from '~/config/editor.config'
import { useVideoEmbed } from './useVideoEmbed'

export interface EditorHandler {
  canExecute: (editor: Editor, item?: any) => boolean
  execute: (editor: Editor, item?: any) => any
  isActive: (editor: Editor, item?: any) => boolean
  isDisabled?: (editor: Editor, item?: any) => boolean
}

// Re-export colors from config for convenience
export { textColors, highlightColors }

/**
 * Verse block handler
 */
export const verseHandler: EditorHandler = {
  canExecute: (editor: Editor) => editor.can().setVerse(),
  execute: (editor: Editor) => editor.chain().focus().setVerse().run(),
  isActive: (editor: Editor) => editor.isActive('verse'),
  isDisabled: (editor: Editor) => !editor.isEditable
}

/**
 * Spacer block handler
 */
export const spacerHandler: EditorHandler = {
  canExecute: (editor: Editor) => editor.can().setSpacer(),
  execute: (editor: Editor) => editor.chain().focus().setSpacer().run(),
  isActive: () => false,
  isDisabled: (editor: Editor) => !editor.isEditable
}

/**
 * Create Vimeo handler with modal callback
 */
export function createVimeoHandler(showModal: (editor: Editor) => Promise<boolean | void>): EditorHandler {
  return {
    canExecute: () => true,
    execute: async (editor: Editor) => {
      await showModal(editor)
    },
    isActive: (editor: Editor) => editor.isActive('vimeo'),
    isDisabled: (editor: Editor) => !editor.isEditable
  }
}

/**
 * Composable for editor handlers
 */
export function useEditorHandlers() {
  const { showVideoUrlModal } = useVideoEmbed()

  /**
   * Create custom handlers for UEditor
   */
  const createCustomHandlers = () => {
    return {
      verse: verseHandler,
      spacer: spacerHandler,
      vimeo: createVimeoHandler(showVideoUrlModal)
    }
  }

  return {
    createCustomHandlers,
    verseHandler,
    spacerHandler,
    createVimeoHandler
  }
}
