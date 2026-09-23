<template>
  <div>
    <UCard v-if="status === 'pending' && rollouts.length === 0" class="text-center py-8">
      <UIcon name="i-lucide-loader" class="animate-spin text-2xl" />
    </UCard>

    <UCard v-else-if="rollouts.length === 0" class="text-center py-8">
      <p class="text-muted">No language is being rolled out.</p>
      <p class="text-sm text-muted mt-1">
        Running <code>/add-language-everywhere &lt;code&gt;</code> starts one here.
      </p>
    </UCard>

    <div v-else class="flex flex-col gap-4">
      <UCard v-for="rollout in rollouts" :key="rollout.code">
        <template #header>
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0 cursor-pointer" @click="toggle(rollout.code)">
              <div class="flex items-center gap-2">
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :icon="collapsed.has(rollout.code) ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'"
                  :aria-label="collapsed.has(rollout.code) ? 'Expand' : 'Collapse'"
                  :aria-expanded="!collapsed.has(rollout.code)"
                  @click.stop="toggle(rollout.code)"
                />
                <h2 class="text-lg font-semibold">{{ rollout.name_en }}</h2>
                <span v-if="rollout.name_local && rollout.name_local !== rollout.name_en" class="text-muted">
                  {{ rollout.name_local }}
                </span>
                <UBadge color="neutral" variant="subtle" :label="rollout.code" />
              </div>
              <p class="text-xs text-muted mt-1">
                Started {{ formatDate(rollout.started_at) }}<span v-if="rollout.started_by_name"> by {{ rollout.started_by_name }}</span>
                <span v-if="rollout.status_report_at"> · status report {{ formatDate(rollout.status_report_at) }}</span>
              </p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <span class="text-sm text-muted">{{ rollout.done_count }} / {{ rollout.total_count }}</span>
              <UButton
                v-if="canManage"
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide-trash-2"
                aria-label="Stop tracking"
                @click="() => { pendingRemoval = rollout }"
              />
            </div>
          </div>
          <UProgress
            class="mt-3"
            size="sm"
            :model-value="rollout.done_count"
            :max="rollout.total_count"
            :color="rollout.done_count === rollout.total_count ? 'success' : 'primary'"
          />
        </template>

        <template v-if="!collapsed.has(rollout.code)" #default>
          <div class="flex flex-col gap-5">
            <section v-for="group in groups" :key="group.key">
              <h3 class="text-xs font-semibold uppercase tracking-wide text-muted mb-2">{{ group.label }}</h3>
              <ul class="flex flex-col divide-y divide-default">
                <li
                  v-for="task in rollout.tasks.filter(t => t.group === group.key)"
                  :key="task.key"
                  class="flex items-start gap-3 py-2"
                >
                  <UIcon
                    :name="STATE_ICONS[task.state]"
                    class="mt-0.5 size-5 shrink-0"
                    :class="[STATE_CLASSES[task.state], task.state === 'running' && task.kind === 'skill' ? 'animate-spin' : '']"
                  />
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="font-medium" :class="task.state === 'skipped' ? 'line-through text-muted' : ''">{{ task.label }}</span>
                      <UBadge v-if="task.progress" color="neutral" variant="subtle" size="sm">
                        {{ task.progress.done }} / {{ task.progress.total }}
                      </UBadge>
                      <UBadge v-if="task.state === 'failed'" color="error" variant="subtle" size="sm" label="failed" />
                      <UBadge v-if="task.state === 'skipped'" color="neutral" variant="subtle" size="sm" label="skipped" />
                      <UBadge v-if="task.kind === 'detected'" color="neutral" variant="outline" size="sm" label="automatic" />
                    </div>
                    <p class="text-xs text-muted">{{ task.description }}</p>
                    <p v-if="task.note" class="text-xs mt-0.5">{{ task.note }}</p>
                    <p v-if="task.status_detail" class="text-xs text-muted mt-0.5 font-mono">{{ task.status_detail }}</p>
                    <p v-if="task.updated_by_name && task.state !== 'pending'" class="text-xs text-muted mt-0.5">
                      {{ task.updated_by_name }}, {{ formatDate(task.updated_at) }}
                    </p>
                  </div>
                  <div v-if="canManage && task.kind !== 'detected'" class="flex items-center gap-1 shrink-0">
                    <UCheckbox
                      :model-value="task.state === 'done'"
                      :disabled="saving === `${rollout.code}:${task.key}`"
                      :aria-label="`Mark ${task.label} done`"
                      @update:model-value="(value) => setState(rollout.code, task.key, value ? 'done' : 'pending')"
                    />
                    <UDropdownMenu :items="menuItems(rollout.code, task)">
                      <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-ellipsis-vertical" aria-label="More" />
                    </UDropdownMenu>
                  </div>
                </li>
              </ul>
            </section>
          </div>
        </template>
      </UCard>
    </div>

    <UModal
      :open="!!pendingRemoval"
      title="Stop tracking this language?"
      @update:open="(open) => { if (!open) pendingRemoval = null }"
    >
      <template #body>
        <p>
          {{ pendingRemoval?.name_en }} leaves this page and its ticked tasks are discarded.
          The glossary and everything already translated stay as they are.
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="outline" color="neutral" @click="() => { pendingRemoval = null }">Cancel</UButton>
          <UButton color="error" :loading="removing" @click="removeRollout">Stop tracking</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

type TaskState = 'pending' | 'running' | 'done' | 'failed' | 'skipped'

interface RolloutTask {
  key: string
  group: string
  kind: 'detected' | 'skill' | 'manual'
  label: string
  description: string
  state: TaskState
  note: string
  progress: { done: number; total: number } | null
  status_detail: string | null
  updated_at: string | null
  updated_by_name: string | null
}

interface LanguageRollout {
  code: string
  name_en: string
  name_local: string
  started_at: string
  started_by_name: string | null
  status_report_at: string | null
  done_count: number
  total_count: number
  tasks: RolloutTask[]
}

const STATE_ICONS: Record<TaskState, string> = {
  pending: 'i-lucide-circle',
  running: 'i-lucide-loader-circle',
  done: 'i-lucide-circle-check',
  failed: 'i-lucide-circle-x',
  skipped: 'i-lucide-circle-minus'
}

const STATE_CLASSES: Record<TaskState, string> = {
  pending: 'text-dimmed',
  running: 'text-info',
  done: 'text-success',
  failed: 'text-error',
  skipped: 'text-muted'
}

const { canAccess } = useAuthUser()
const canManage = computed(() => canAccess('glossary.manage'))
const toast = useToast()

const { data, status, refresh } = await useFetch<{ groups: { key: string; label: string }[]; rollouts: LanguageRollout[] }>(
  '/api/admin/language-rollouts',
  { default: () => ({ groups: [], rollouts: [] }) }
)

const groups = computed(() => data.value?.groups || [])
const rollouts = computed(() => data.value?.rollouts || [])

const saving = ref<string | null>(null)
const pendingRemoval = ref<LanguageRollout | null>(null)
const removing = ref(false)
const collapsed = ref(new Set<string>())

function toggle(code: string) {
  const next = new Set(collapsed.value)
  if (next.has(code)) next.delete(code)
  else next.add(code)
  collapsed.value = next
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : ''
}

function menuItems(code: string, task: RolloutTask): DropdownMenuItem[] {
  return [
    { label: 'Mark done', icon: 'i-lucide-circle-check', disabled: task.state === 'done', onSelect: () => setState(code, task.key, 'done') },
    { label: 'Skip for this language', icon: 'i-lucide-circle-minus', disabled: task.state === 'skipped', onSelect: () => setState(code, task.key, 'skipped') },
    { label: 'Reset to pending', icon: 'i-lucide-rotate-ccw', disabled: task.state === 'pending', onSelect: () => setState(code, task.key, 'pending') }
  ]
}

function replaceRollout(updated: LanguageRollout) {
  if (!data.value) return
  data.value = {
    ...data.value,
    rollouts: data.value.rollouts.map(r => r.code === updated.code ? updated : r)
  }
}

async function setState(code: string, key: string, state: TaskState) {
  saving.value = `${code}:${key}`
  try {
    const res = await $fetch<{ rollout: LanguageRollout }>(`/api/admin/language-rollouts/${code}/tasks/${key}`, {
      method: 'PUT',
      body: { state }
    })
    replaceRollout(res.rollout)
  } catch (error: any) {
    toast.add({ title: 'Could not update the task', description: error?.data?.statusMessage || error?.message, color: 'error' })
  } finally {
    saving.value = null
  }
}

async function removeRollout() {
  if (!pendingRemoval.value) return
  removing.value = true
  try {
    await $fetch(`/api/admin/language-rollouts/${pendingRemoval.value.code}`, { method: 'DELETE' })
    pendingRemoval.value = null
    await refresh()
  } catch (error: any) {
    toast.add({ title: 'Could not stop tracking', description: error?.data?.statusMessage || error?.message, color: 'error' })
  } finally {
    removing.value = false
  }
}

defineExpose({ refresh, status })
</script>
