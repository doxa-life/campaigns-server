<script setup lang="ts">
interface Props { slug: string, iconUrl: string | null }
const props = defineProps<Props>()
const emit = defineEmits<{ uploaded: [url: string] }>()

const uploading = ref(false)
const error = ref<string | null>(null)

async function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploading.value = true
  error.value = null
  try {
    const form = new FormData()
    form.append('file', file)
    const updated = await $fetch<{ icon_url: string | null }>(
      `/api/admin/context/portfolios/${props.slug}/icon`,
      { method: 'POST', body: form }
    )
    emit('uploaded', updated.icon_url ?? '')
  } catch (e) {
    error.value = (e as { statusMessage?: string }).statusMessage ?? 'Upload failed.'
  } finally {
    uploading.value = false
    input.value = ''
  }
}
</script>

<template>
  <div class="flex items-center gap-3">
    <img v-if="iconUrl" :src="iconUrl" alt="" class="size-16 rounded object-cover">
    <div v-else class="size-16 rounded grid place-items-center bg-(--ui-bg-elevated)">
      <UIcon name="i-lucide-image" class="size-6 text-(--ui-text-muted)" />
    </div>
    <label class="cursor-pointer">
      <input type="file" accept="image/*" class="hidden" @change="onPick">
      <UButton as="span" variant="outline" :loading="uploading">
        Upload
      </UButton>
    </label>
    <p v-if="error" class="text-(--ui-error) text-sm">
      {{ error }}
    </p>
  </div>
</template>
