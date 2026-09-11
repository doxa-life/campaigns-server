<script setup lang="ts">
interface PendingAnchor {
  quotedText: string
  anchorStart: number
  anchorEnd: number
}

interface Props {
  slug: string
  sectionKey: string
  pending?: PendingAnchor | null
}
const props = withDefaults(defineProps<Props>(), { pending: null })
const emit = defineEmits<{ 'clear-pending': [] }>()

interface CommentRow {
  id: string
  author_id: string
  author_name: string | null
  quoted_text: string
  anchor_start: number
  anchor_end: number
  content: string
  is_resolved: boolean
  anchor_stale: boolean
  created_at: string
  replies: Array<{ id: string, author_id: string, author_name: string | null, content: string, created_at: string }>
}

const { canAccess } = useAuthUser()
const canComment = computed(() => canAccess('context.edit'))
const canResolve = computed(() => canAccess('context.manage'))

const includeResolved = ref(false)
const replyingTo = ref<string | null>(null)
const replyText = ref('')
const replying = ref(false)

const base = computed(() => `/api/admin/context/portfolios/${props.slug}/sections/${props.sectionKey}/comments`)

const { data, refresh } = await useAsyncData(
  () => `context-comments-${props.slug}-${props.sectionKey}-${includeResolved.value}`,
  () => $fetch<{ comments: CommentRow[] }>(`${base.value}?include_resolved=${includeResolved.value}`),
  { watch: [includeResolved, () => props.sectionKey] }
)
const comments = computed(() => data.value?.comments ?? [])

async function setResolved(id: string, resolved: boolean) {
  // Annotated as a plain string so typed routes do not narrow this to a GET-only path.
  const url: string = `${base.value}/${id}/${resolved ? 'resolve' : 'unresolve'}`
  await $fetch(url, { method: 'POST' })
  await refresh()
}

async function remove(id: string) {
  await $fetch(`${base.value}/${id}`, { method: 'DELETE' })
  await refresh()
}

function startReply(id: string) {
  replyingTo.value = id
  replyText.value = ''
}

async function sendReply(id: string) {
  const content = replyText.value.trim()
  if (!content) return
  replying.value = true
  try {
    const url: string = `${base.value}/${id}/replies`
    await $fetch(url, { method: 'POST', body: { content } })
    replyingTo.value = null
    replyText.value = ''
    await refresh()
  } finally {
    replying.value = false
  }
}

async function onPosted() {
  emit('clear-pending')
  await refresh()
}
</script>

<template>
  <div class="p-3 space-y-3 overflow-auto">
    <div class="flex items-center justify-between">
      <h3 class="font-semibold">
        Comments
      </h3>
      <UCheckbox v-model="includeResolved" label="Include resolved" />
    </div>

    <ContextCommentForm
      v-if="pending && canComment"
      :slug="slug"
      :section-key="sectionKey"
      :quoted-text="pending.quotedText"
      :anchor-start="pending.anchorStart"
      :anchor-end="pending.anchorEnd"
      @posted="onPosted"
      @cancel="() => emit('clear-pending')"
    />
    <p v-else-if="canComment" class="text-xs text-(--ui-text-muted)">
      Select text in the section to comment on it.
    </p>

    <p v-if="comments.length === 0" class="text-sm text-(--ui-text-muted)">
      No comments.
    </p>

    <article
      v-for="c in comments"
      :key="c.id"
      class="border border-(--ui-border) rounded p-3 space-y-2"
    >
      <div class="text-xs text-(--ui-text-muted) flex items-center gap-2 flex-wrap">
        <span>{{ c.author_name ?? 'Unknown' }}</span>
        <span>·</span>
        <span>{{ new Date(c.created_at).toLocaleString() }}</span>
        <UBadge v-if="c.anchor_stale" color="warning" size="xs" variant="subtle">
          Stale
        </UBadge>
        <UBadge v-if="c.is_resolved" color="success" size="xs" variant="subtle">
          Resolved
        </UBadge>
      </div>

      <blockquote class="text-xs italic border-l-2 border-(--ui-border) pl-2 text-(--ui-text-muted)">
        {{ c.quoted_text }}
      </blockquote>
      <p class="text-sm whitespace-pre-wrap">
        {{ c.content }}
      </p>

      <div v-if="c.replies.length" class="space-y-1 pl-3 border-l border-(--ui-border)">
        <div v-for="r in c.replies" :key="r.id" class="text-sm">
          <span class="font-medium">{{ r.author_name ?? 'Unknown' }}:</span>
          {{ r.content }}
        </div>
      </div>

      <form v-if="replyingTo === c.id" class="space-y-2" @submit.prevent="sendReply(c.id)">
        <UTextarea v-model="replyText" placeholder="Reply…" :rows="2" autofocus />
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" size="xs" type="button" @click="() => { replyingTo = null }">
            Cancel
          </UButton>
          <UButton type="submit" size="xs" :loading="replying" :disabled="!replyText.trim()">
            Reply
          </UButton>
        </div>
      </form>

      <div class="flex justify-end gap-1">
        <UButton v-if="canComment && replyingTo !== c.id" variant="ghost" size="xs" @click="() => startReply(c.id)">
          Reply
        </UButton>
        <UButton
          v-if="canResolve"
          variant="ghost"
          size="xs"
          @click="() => setResolved(c.id, !c.is_resolved)"
        >
          {{ c.is_resolved ? 'Reopen' : 'Resolve' }}
        </UButton>
        <UButton
          v-if="canComment"
          variant="ghost"
          color="error"
          size="xs"
          icon="i-lucide-trash"
          aria-label="Delete comment"
          @click="() => remove(c.id)"
        />
      </div>
    </article>
  </div>
</template>
