<template>
  <UPopover v-model:open="popoverOpen">
    <UButton
      variant="ghost"
      :aria-label="$t('campaign.share.button')"
      :title="$t('campaign.share.button')"
    >
      <UIcon name="i-lucide-share-2" class="size-5" />
    </UButton>

    <template #content>
      <div class="flex flex-col gap-1 p-2 min-w-48">
        <UButton
          variant="ghost"
          color="neutral"
          block
          class="justify-start"
          icon="i-lucide-qr-code"
          @click="openQrModal"
        >
          {{ $t('campaign.share.qrCode') }}
        </UButton>
        <!-- Mobile: native share sheet -->
        <UButton
          v-if="isMobile"
          variant="ghost"
          color="neutral"
          block
          class="justify-start"
          icon="i-lucide-share"
          @click="handleNativeShare"
        >
          {{ $t('campaign.share.shareLink') }}
        </UButton>
        <!-- Desktop: copy link -->
        <UButton
          v-else
          variant="ghost"
          color="neutral"
          block
          class="justify-start"
          icon="i-lucide-copy"
          @click="handleCopyLink"
        >
          {{ $t('campaign.share.copyLink') }}
        </UButton>
      </div>
    </template>
  </UPopover>

  <ShareQrModal
    v-model:open="qrModalOpen"
    :url="currentUrl"
  />
</template>

<script setup lang="ts">
const { t } = useI18n()
const toast = useToast()
const route = useRoute()
const config = useRuntimeConfig()
const { peopleGroupTitle } = usePeopleGroup()

const popoverOpen = ref(false)
const qrModalOpen = ref(false)

const isMobile = computed(() => {
  if (import.meta.client) {
    return (navigator as any).userAgentData?.mobile || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  }
  return false
})

const currentUrl = computed(() => {
  const base = config.public.siteUrl as string
  return `${base.replace(/\/$/, '')}${route.fullPath}`
})

const shareTitle = computed(() => {
  return t('campaign.header.prayFor', { campaign: peopleGroupTitle.value })
})

function openQrModal() {
  popoverOpen.value = false
  qrModalOpen.value = true
}

async function handleCopyLink() {
  popoverOpen.value = false
  await copyToClipboard()
}

async function handleNativeShare() {
  popoverOpen.value = false
  const url = currentUrl.value

  try {
    await navigator.share({ title: shareTitle.value, text: shareTitle.value, url })
  } catch (err: any) {
    if (err.name !== 'AbortError') {
      await copyToClipboard()
    }
  }
}

async function copyToClipboard() {
  try {
    await navigator.clipboard.writeText(currentUrl.value)
    toast.add({
      title: t('campaign.share.copied'),
      description: t('campaign.share.copiedDescription'),
      color: 'success'
    })
  } catch {
    toast.add({
      title: t('campaign.share.copyFailed'),
      color: 'error'
    })
  }
}
</script>
