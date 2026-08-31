<template>
  <div class="cc-widget">
    <UBadge
      v-for="email in selected"
      :key="email"
      color="neutral"
      variant="subtle"
      class="cc-chip"
    >
      {{ email }}
      <UButton
        icon="i-lucide-x"
        size="xs"
        color="neutral"
        variant="ghost"
        :aria-label="`Remove ${email}`"
        @click="remove(email)"
      />
    </UBadge>
    <UInputMenu
      v-model:search-term="searchTerm"
      v-model:open="menuOpen"
      :model-value="undefined"
      :items="suggestionItems"
      value-key="value"
      :placeholder="$t('inbox.compose.ccPlaceholder')"
      :create-item="true"
      size="xs"
      class="cc-add"
      @update:model-value="onSelect"
      @create="onCreate"
    />
  </div>
</template>

<script setup lang="ts">
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const props = defineProps<{
  modelValue: string[]
  suggestions: { label: string; value: string }[]
}>()

const emit = defineEmits<{
  'update:modelValue': [emails: string[]]
}>()

const toast = useToast()
const { t } = useI18n()

const selected = computed(() => props.modelValue || [])
const searchTerm = ref('')
const menuOpen = ref(false)

const suggestionItems = computed(() => props.suggestions.filter(s => !selected.value.includes(s.value)))

function add(raw: unknown) {
  if (raw == null) return
  const email = String(raw).trim().toLowerCase()
  if (!email) return
  if (!EMAIL_RE.test(email)) {
    toast.add({ title: t('inbox.compose.ccInvalid'), color: 'error' })
    return
  }
  if (!selected.value.includes(email)) {
    emit('update:modelValue', [...selected.value, email])
  }
  searchTerm.value = ''
  menuOpen.value = false
}

function onSelect(value: any) {
  add(value)
}

function onCreate(value: any) {
  add(value)
}

function remove(email: string) {
  emit('update:modelValue', selected.value.filter(e => e !== email))
}
</script>

<style scoped>
.cc-widget {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  align-items: center;
}

.cc-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.cc-add {
  min-width: 14rem;
}
</style>
