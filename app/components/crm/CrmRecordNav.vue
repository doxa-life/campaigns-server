<script setup lang="ts" generic="T extends { id: number | string }">
const props = defineProps<{
  items: readonly T[]
  currentId: T['id'] | null | undefined
}>()

const emit = defineEmits<{
  navigate: [item: T]
}>()

const index = computed(() =>
  props.currentId == null ? -1 : props.items.findIndex(i => i.id === props.currentId)
)

const prev = computed(() =>
  index.value > 0 ? props.items[index.value - 1]! : null
)

const next = computed(() =>
  index.value >= 0 && index.value < props.items.length - 1
    ? props.items[index.value + 1]!
    : null
)

function goPrev() {
  if (prev.value) emit('navigate', prev.value)
}

function goNext() {
  if (next.value) emit('navigate', next.value)
}
</script>

<template>
  <UButton
    icon="i-lucide-chevron-left"
    variant="ghost"
    color="neutral"
    size="sm"
    :disabled="!prev"
    aria-label="Previous record"
    @click="goPrev"
  />
  <UButton
    icon="i-lucide-chevron-right"
    variant="ghost"
    color="neutral"
    size="sm"
    :disabled="!next"
    aria-label="Next record"
    @click="goNext"
  />
</template>
