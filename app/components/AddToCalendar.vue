<template>
  <div class="flex flex-wrap items-center gap-2">
    <span class="text-xs text-[var(--ui-text-muted)]">{{ $t('calendar.addToCalendar') }}:</span>
    <UButton
      :href="googleUrl"
      target="_blank"
      variant="outline"
      size="xs"
      icon="i-lucide-calendar"
    >
      {{ $t('calendar.googleCalendar') }}
    </UButton>
    <UButton
      :to="icsUrl"
      external
      variant="outline"
      size="xs"
      icon="i-lucide-download"
    >
      {{ $t('calendar.downloadIcs') }}
    </UButton>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  googleUrl: string
  icsUrl: string
}>()
</script>
