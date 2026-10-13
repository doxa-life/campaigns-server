<template>
  <section v-if="items && items.length > 0" class="bg-[var(--ui-bg-elevated)] border-t border-[var(--ui-border)] py-12 px-4">
    <div class="max-w-4xl mx-auto">
      <h2 class="text-xl font-bold mb-6 text-center">{{ $t('prayerFuel.pastPrayers.title') }}</h2>
      <div class="flex flex-wrap justify-center gap-3">
        <NuxtLink
          v-for="item in items"
          :key="item.id"
          :to="localePath(`/${slug}/prayer/${item.content_date}`)"
          class="px-4 py-2 bg-[var(--ui-bg)] border border-[var(--ui-border)] rounded-lg no-underline text-[var(--ui-text)] transition-all hover:border-[var(--ui-text-muted)] hover:shadow-sm"
        >
          {{ formatPastDate(item.content_date) }}
        </NuxtLink>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
interface PastPrayerItem {
  id: number | string
  content_date: string
}

const props = defineProps<{
  items: PastPrayerItem[]
  slug: string
  language?: string
}>()

const localePath = useLocalePath()

function formatPastDate(dateString: string) {
  return parseLocalDate(dateString).toLocaleDateString(props.language || 'en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}
</script>
