import { VueRenderer } from '@tiptap/vue-3'
import type { SuggestionOptions } from '@tiptap/suggestion'
import MentionList from '~/components/MentionList.vue'

interface MentionUser {
  id: string
  label: string
}

let cachedUsers: MentionUser[] | null = null

async function fetchUsers(): Promise<MentionUser[]> {
  if (cachedUsers) return cachedUsers

  try {
    const res = await $fetch<{ users: Array<{ id: string; display_name: string }> }>('/api/admin/users')
    cachedUsers = res.users.map(u => ({
      id: u.id,
      label: u.display_name
    }))
    return cachedUsers
  } catch {
    return []
  }
}

export const mentionSuggestion: Omit<SuggestionOptions, 'editor'> = {
  items: async ({ query }) => {
    const users = await fetchUsers()
    return users
      .filter(u => u.label.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 8)
  },

  render: () => {
    let component: VueRenderer
    let popup: HTMLElement | null = null

    return {
      onStart: (props) => {
        component = new VueRenderer(MentionList, {
          props,
          editor: props.editor
        })

        if (!component.element) return

        const editorEl = props.editor.options.element as HTMLElement | undefined
        const container = editorEl?.closest('.editor-wrapper') || editorEl?.parentElement || document.body

        popup = document.createElement('div')
        popup.style.position = 'fixed'
        popup.style.zIndex = '100'
        popup.appendChild(component.element)
        container.appendChild(popup)

        updatePosition(props.clientRect ?? null, popup)
      },

      onUpdate: (props) => {
        component?.updateProps(props)
        if (popup && props.clientRect) {
          updatePosition(props.clientRect ?? null, popup)
        }
      },

      onKeyDown: (props) => {
        if (props.event.key === 'Escape') {
          popup?.remove()
          popup = null
          component?.destroy()
          return true
        }

        return component?.ref?.onKeyDown(props.event) ?? false
      },

      onExit: () => {
        popup?.remove()
        popup = null
        component?.destroy()
      }
    }
  }
}

function updatePosition(clientRect: (() => DOMRect | null) | null, popup: HTMLElement) {
  const rect = clientRect?.()
  if (!rect) return

  popup.style.left = `${rect.left}px`
  popup.style.top = `${rect.bottom + 4}px`
}
