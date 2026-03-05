<script setup lang="ts">
interface Segment {
  text: string
  link: string | null
}

const props = defineProps<{
  modelValue: Segment[] | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Segment[]]
}>()

const segments = computed(() => props.modelValue || [])

function updateSegment(index: number, field: 'text' | 'link', value: string) {
  const updated = segments.value.map((seg, i) => {
    if (i !== index) return { ...seg }
    if (field === 'link') {
      return { ...seg, link: value || null }
    }
    return { ...seg, text: value }
  })
  emit('update:modelValue', updated)
}

function addSegment() {
  emit('update:modelValue', [...segments.value, { text: '', link: null }])
}

function removeSegment(index: number) {
  emit('update:modelValue', segments.value.filter((_, i) => i !== index))
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <p v-if="segments.length" class="text-sm text-muted px-1">
      <template v-for="(seg, i) in segments" :key="i">
        <a v-if="seg.link" :href="seg.link" target="_blank" rel="noopener noreferrer" class="underline">{{ seg.text }}</a>
        <span v-else>{{ seg.text }}</span>
      </template>
    </p>
    <div v-for="(seg, i) in segments" :key="i" class="flex items-center gap-2">
      <UInput
        :model-value="seg.text"
        @update:model-value="updateSegment(i, 'text', $event as string)"
        placeholder="Text"
        class="flex-1"
      />
      <UInput
        :model-value="seg.link || ''"
        @update:model-value="updateSegment(i, 'link', $event as string)"
        placeholder="https://..."
        class="flex-1"
      />
      <UButton
        icon="i-lucide-trash-2"
        color="error"
        variant="ghost"
        size="xs"
        @click="removeSegment(i)"
      />
    </div>
    <div>
      <UButton
        icon="i-lucide-plus"
        label="Add segment"
        variant="outline"
        size="xs"
        @click="addSegment"
      />
    </div>
  </div>
</template>
