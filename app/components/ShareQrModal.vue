<template>
  <UModal v-model:open="isOpen" :title="$t('campaign.share.qrTitle')">
    <template #body>
      <div class="flex flex-col items-center gap-4 p-6">
        <img v-if="qrDataUrl" :src="qrDataUrl" :alt="$t('campaign.share.qrTitle')" class="w-64 h-64" />
        <div v-else class="w-64 h-64 flex items-center justify-center">
          <UIcon name="i-lucide-loader" class="w-8 h-8 animate-spin" />
        </div>
        <p class="text-sm text-muted text-center">{{ $t('campaign.share.qrDescription') }}</p>
        <p class="text-xs text-muted break-all text-center max-w-xs">{{ url }}</p>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end w-full">
        <UButton variant="outline" @click="isOpen = false">
          {{ $t('campaign.share.close') }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import QRCode from 'qrcode'

interface Props {
  open?: boolean
  url: string
}

const props = withDefaults(defineProps<Props>(), {
  open: true
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  close: []
}>()

const isOpen = computed({
  get: () => props.open,
  set: (value) => {
    emit('update:open', value)
    if (!value) emit('close')
  }
})

const qrDataUrl = ref<string | null>(null)

watch(() => props.url, async (newUrl) => {
  if (newUrl) {
    qrDataUrl.value = await QRCode.toDataURL(newUrl, {
      width: 256,
      margin: 2,
      color: { dark: '#3B463D', light: '#FFFFFF' }
    })
  }
}, { immediate: true })
</script>
