<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'auth' })

const route = useRoute()
const slug = computed(() => String(route.params.slug ?? ''))
const sectionKey = computed(() => String(route.params.key ?? ''))

interface SectionData {
  portfolio_id: string
  key: string
  title: string
  description: string
  is_custom: boolean
  content: string
  last_edited_at: string | null
  last_edited_by_name: string | null
}

const { data, refresh } = await useAsyncData(
  () => `context-section-${slug.value}-${sectionKey.value}`,
  () => $fetch<SectionData>(`/api/admin/context/portfolios/${slug.value}/sections/${sectionKey.value}`)
)

const editing = ref(false)
const draft = ref(data.value?.content ?? '')
const saving = ref(false)
const removeOpen = ref(false)
const removing = ref(false)
const error = ref<string | null>(null)
const sidebarOpen = ref(false)
const showComments = ref(false)
const pendingAnchor = ref<{ quotedText: string, anchorStart: number, anchorEnd: number } | null>(null)
const anchorNotice = ref<string | null>(null)

const { canAccess } = useAuthUser()
const canEdit = computed(() => canAccess('context.edit'))
const canManageSections = computed(() => canAccess('context.manage'))

watch(data, (next) => {
  if (next && !editing.value) draft.value = next.content
})

const wordCount = computed(() => {
  const text = (editing.value ? draft.value : data.value?.content ?? '').trim()
  return text ? text.split(/\s+/).length : 0
})

/**
 * Anchor a new comment to the selected words. The selection comes from the
 * rendered HTML, so its plain text is located in the markdown source to get the
 * offsets the server stores. A selection spanning markdown syntax has no
 * verbatim match and is rejected rather than anchored to the wrong place.
 */
function onSelectQuote(quote: string) {
  if (!canEdit.value) return
  const content = data.value?.content ?? ''
  const start = content.indexOf(quote)
  if (start === -1) {
    pendingAnchor.value = null
    anchorNotice.value = 'That selection spans formatting. Select plain text to comment on it.'
    return
  }
  anchorNotice.value = null
  pendingAnchor.value = { quotedText: quote, anchorStart: start, anchorEnd: start + quote.length }
  showComments.value = true
}

function startEdit() {
  draft.value = data.value?.content ?? ''
  editing.value = true
}

function cancelEdit() {
  draft.value = data.value?.content ?? ''
  editing.value = false
  error.value = null
}

async function removeSection() {
  removing.value = true
  error.value = null
  try {
    await $fetch(`/api/admin/context/portfolios/${slug.value}/sections/${sectionKey.value}`, { method: 'DELETE' })
    removeOpen.value = false
    await refreshNuxtData([`context-sidebar-sections-${slug.value}`, `context-sections-${slug.value}`])
    await navigateTo(`/admin/context/${slug.value}`)
  } catch (e) {
    error.value = (e as { statusMessage?: string }).statusMessage ?? 'Remove failed.'
  } finally {
    removing.value = false
  }
}

async function save() {
  saving.value = true
  error.value = null
  try {
    await $fetch(`/api/admin/context/portfolios/${slug.value}/sections/${sectionKey.value}`, {
      method: 'PUT',
      body: { content: draft.value }
    })
    await refresh()
    await refreshNuxtData([`context-sidebar-sections-${slug.value}`, `context-sections-${slug.value}`])
    editing.value = false
  } catch (e) {
    error.value = (e as { statusMessage?: string }).statusMessage ?? 'Save failed.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="flex flex-1 min-h-0">
    <ContextSidebar v-model:open="sidebarOpen" />

    <section class="flex-1 flex flex-col min-w-0 border-l-0 lg:border-l border-(--ui-border) overflow-hidden">
      <header class="flex items-center gap-2 px-3 py-2 border-b border-(--ui-border) bg-(--ui-bg)">
        <UButton
          class="lg:hidden"
          icon="i-lucide-menu"
          variant="ghost"
          color="neutral"
          size="sm"
          aria-label="Open sidebar"
          @click="() => { sidebarOpen = true }"
        />
        <div class="flex-1 min-w-0">
          <h1 class="font-semibold truncate">
            {{ data?.title ?? sectionKey }}
          </h1>
          <p v-if="data?.description" class="text-xs text-(--ui-text-muted) truncate">
            {{ data.description }}
          </p>
        </div>
        <UButton
          variant="ghost"
          color="neutral"
          icon="i-lucide-message-square"
          size="sm"
          aria-label="Toggle comments"
          title="Comments"
          @click="() => { showComments = !showComments }"
        />
        <UButton
          variant="outline"
          icon="i-lucide-history"
          size="sm"
          :to="`/admin/context/${slug}/sections/${sectionKey}/versions`"
        >
          History
        </UButton>
        <UButton
          v-if="canManageSections && !editing"
          variant="outline"
          color="error"
          icon="i-lucide-trash"
          size="sm"
          aria-label="Remove section"
          @click="() => { removeOpen = true }"
        />
        <template v-if="editing">
          <UButton variant="ghost" size="sm" @click="cancelEdit">
            Cancel
          </UButton>
          <UButton color="primary" size="sm" :loading="saving" @click="save">
            Save
          </UButton>
        </template>
        <UButton
          v-else-if="canEdit"
          color="primary"
          variant="outline"
          icon="i-lucide-pencil"
          size="sm"
          @click="startEdit"
        >
          Edit
        </UButton>
      </header>

      <ContextMarkdownToolbar v-if="editing" :textarea-id="`section-editor-${sectionKey}`" />

      <div class="flex-1 flex min-h-0">
        <div class="flex-1 flex min-h-0 overflow-auto">
          <textarea
            v-if="editing"
            :id="`section-editor-${sectionKey}`"
            v-model="draft"
            class="flex-1 w-full h-full p-6 font-mono text-sm outline-none bg-(--ui-bg) resize-none"
            placeholder="Start writing in markdown…"
          />
          <div v-else class="flex-1 p-6 overflow-auto">
            <div v-if="!data?.content" class="text-(--ui-text-muted) text-sm italic">
              This section is empty.
              <template v-if="canEdit">
                Click <strong>Edit</strong> to add content.
              </template>
            </div>
            <ContextSectionPreview v-else :content="data.content" @select-quote="onSelectQuote" />
          </div>
        </div>

        <aside
          v-if="showComments"
          class="w-80 shrink-0 border-l border-(--ui-border) overflow-auto hidden md:block"
        >
          <ContextCommentsSidebar
            :slug="slug"
            :section-key="sectionKey"
            :pending="pendingAnchor"
            @clear-pending="() => { pendingAnchor = null }"
          />
        </aside>
      </div>

      <footer class="flex items-center gap-3 px-3 py-1.5 border-t border-(--ui-border) bg-(--ui-bg) text-xs text-(--ui-text-muted)">
        <span>{{ wordCount }} words</span>
        <span v-if="data?.last_edited_at">
          · last edited {{ new Date(data.last_edited_at).toLocaleString() }}
          <span v-if="data.last_edited_by_name"> by {{ data.last_edited_by_name }}</span>
        </span>
        <span class="flex-1" />
        <span v-if="anchorNotice" class="text-(--ui-warning)">{{ anchorNotice }}</span>
        <span v-if="error" class="text-(--ui-error)">{{ error }}</span>
      </footer>
    </section>

    <ContextConfirmModal
      v-model:open="removeOpen"
      :title="`Remove ${data?.title ?? sectionKey}?`"
      description="Its content is kept and comes back if you add the section again."
      confirm-label="Remove"
      :loading="removing"
      @confirm="removeSection"
    />
  </div>
</template>
