// Shared state for the portfolio assistant: whether the panel is open, which
// scope it works in, and which conversation is selected. The launcher and the
// panel both read it, so it lives in `useState` rather than component state.
//
// The scope is derived from the route: a section page offers section,
// portfolio, and all; a portfolio page offers portfolio and all; anywhere else
// in the admin only all. When navigation removes the current scope, the most
// specific one still available is selected.

export type AssistantScopeKind = 'section' | 'portfolio' | 'all'

export type AssistantProposalStatus = 'pending' | 'applied' | 'rejected'

export interface AssistantProposal {
  portfolio_slug: string
  portfolio_name: string
  section_key: string
  section_title: string
  current_content: string
  proposed_content: string
  status: AssistantProposalStatus
}

export interface AssistantMessage {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  proposals: AssistantProposal[]
  context_loaded: string[]
  created_at: string
}

export interface AssistantConversation {
  id: string
  portfolio_id: string | null
  section_key: string | null
  title: string
  created_at: string
  updated_at: string
  portfolio_slug?: string | null
  portfolio_name?: string | null
  message_count?: number
}

export interface AssistantScopeTarget {
  portfolio: string | null
  section: string | null
}

/**
 * Which portfolio and section the current URL is showing, or nulls when the
 * page is not a context page. Read from the path rather than route params
 * because other admin pages use a `slug` param for unrelated records, and the
 * launcher is mounted across the whole admin.
 */
function contextRouteTarget(path: string): AssistantScopeTarget {
  const segments = path.split('/').filter(Boolean)
  const index = segments.findIndex((segment, i) => segment === 'context' && segments[i - 1] === 'admin')
  if (index === -1) return { portfolio: null, section: null }

  const portfolio = segments[index + 1] ?? null
  const section = segments[index + 2] === 'sections' ? (segments[index + 3] ?? null) : null
  return { portfolio, section }
}

export function useContextAssistant() {
  const route = useRoute()
  const open = useState<boolean>('context-assistant.open', () => false)
  const scope = useState<AssistantScopeKind>('context-assistant.scope', () => 'all')
  const conversationId = useState<string | null>('context-assistant.conversation', () => null)

  const routeTarget = computed(() => contextRouteTarget(route.path))
  const routeSlug = computed(() => routeTarget.value.portfolio)
  const routeKey = computed(() => routeTarget.value.section)

  const availableScopes = computed<AssistantScopeKind[]>(() => [
    ...(routeKey.value ? ['section' as const] : []),
    ...(routeSlug.value ? ['portfolio' as const] : []),
    'all'
  ])
  const defaultScope = computed<AssistantScopeKind>(() =>
    routeKey.value ? 'section' : routeSlug.value ? 'portfolio' : 'all'
  )

  watch(availableScopes, (available) => {
    if (!available.includes(scope.value)) scope.value = defaultScope.value
  })

  const target = computed<AssistantScopeTarget>(() => ({
    portfolio: scope.value === 'all' ? null : routeSlug.value,
    section: scope.value === 'section' ? routeKey.value : null
  }))
  const targetKey = computed(() => `${target.value.portfolio ?? ''}|${target.value.section ?? ''}`)

  function openPanel() {
    scope.value = defaultScope.value
    open.value = true
  }

  return {
    open, scope, conversationId, routeSlug, routeKey,
    availableScopes, defaultScope, target, targetKey, openPanel
  }
}

/**
 * Whether the assistant can run at all — an OpenRouter key is configured on the
 * server. The launcher stays hidden until this says yes, rather than offering a
 * chat that fails on the first message.
 */
export function useContextAssistantStatus() {
  const { user, canAccess } = useAuthUser()
  const available = useState<boolean>('context-assistant.available', () => false)
  const checked = useState<boolean>('context-assistant.available-checked', () => false)

  async function refresh() {
    checked.value = true
    if (!canAccess('context.view')) {
      available.value = false
      return
    }
    try {
      const status = await $fetch<{ available: boolean }>('/api/admin/context/assistant/status')
      available.value = status.available
    } catch {
      available.value = false
    }
  }

  // The layout loads the user after mount, so the probe waits for it rather
  // than running once against an empty permission set.
  if (import.meta.client) {
    watch(user, (loaded) => {
      if (loaded && !checked.value) refresh()
    }, { immediate: true })
  }

  return { available, refresh }
}
