<template>
  <div class="flex-1 flex flex-col">
    <!-- Content -->
    <main class="flex-1 py-8 px-8">
      <div class="max-w-4xl mx-auto">
        <div v-if="hasContent">
          <div v-for="(contentItem, index) in content" :key="contentItem.id" :class="index > 0 ? 'mt-24' : ''">
            <!-- People Group content -->
            <template v-if="contentItem.content_type === 'people_group' && contentItem.people_group_data">
              <h2 v-if="contentItem.id === -1" class="text-2xl font-bold mb-8">{{ $t('prayerFuel.meetThePeople') }}</h2>
              <h2 v-else-if="contentItem.id === -2" class="text-2xl font-bold mb-8">{{ $t('prayerFuel.peopleGroupOfTheDay') }}</h2>
              <PeopleGroupCard :people-group="contentItem.people_group_data" />
            </template>

            <!-- Day in the Life content (virtual library ID -3) -->
            <template v-else-if="contentItem.id === -3">
              <h2 class="text-2xl font-bold mb-8">{{ $t('prayerFuel.dayInTheLife') }}</h2>
              <RichTextViewer :content="contentItem.content_json as Record<string, any> | null" :item-id="String(contentItem.id)" />
            </template>

            <!-- Static library content -->
            <template v-else>
              <h2 v-if="contentItem.title" class="text-2xl font-bold mb-8">{{ contentItem.title }}</h2>
              <RichTextViewer :content="contentItem.content_json as Record<string, any> | null" :item-id="String(contentItem.id)" />
            </template>

            <p v-if="contentItem.content_type !== 'people_group'" class="text-right text-lg font-bold mt-8 text-secondary-600 uppercase">{{ $t('prayerFuel.pauseAndPray') }}</p>
          </div>
        </div>

        <div v-else class="text-center py-16">
          <div class="text-6xl mb-4">📖</div>
          <h2 class="text-xl font-bold mb-4">{{ $t('prayerFuel.noContent.title') }}</h2>
          <p class="text-[var(--ui-text-muted)] text-lg">{{ $t('prayerFuel.noContent.message') }}</p>
        </div>
      </div>
    </main>

    <!-- Footer with I Prayed Button -->
    <footer v-if="hasContent" class="border-t border-[var(--ui-border)] py-8 px-4 bg-[var(--ui-bg-elevated)] text-center">
      <div class="max-w-4xl mx-auto">
        <UButton
          @click="$emit('pray')"
          :disabled="prayedMarked || submitting"
          :icon="prayedMarked ? 'i-lucide-check' : undefined"
          size="xl"
          class="min-w-[200px] justify-center rounded-full"
        >
          <span v-if="submitting" class="inline-block w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <template v-else-if="!prayedMarked">{{ $t('prayerFuel.button.amen') }}</template>
        </UButton>
        <p v-if="!prayedMarked" class="mt-4 text-sm text-[var(--ui-text-muted)]">
          {{ $t('prayerFuel.button.hint') }}
        </p>
        <p v-else class="mt-4 text-sm text-[var(--ui-text-muted)]">
          {{ $t('prayerFuel.thankYou') }}
        </p>

        <div v-if="copyrightNotices.length" class="mt-8 border-l-2 border-[var(--ui-border)] pl-3 text-left">
          <p v-for="item in copyrightNotices" :key="item.id" class="!text-[10px] italic text-[var(--ui-text-muted)] mt-1">
            {{ item.notice }}
          </p>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { extractTranslations, getCopyrightNotices } from '~/utils/bible-attribution'

interface PeopleGroupData {
  name: string
  image_url: string | null
  description: string | null
  population: number | null
  language: string | null
  religion: string | null
  country: string | null
  lat: number | null
  lng: number | null
  picture_credit: Array<{ text: string; link: string | null }> | null
}

interface ContentItem {
  id: number
  content_type?: string
  people_group_data?: PeopleGroupData | null
  title?: string
  content_json?: Record<string, any> | string | null
}

const props = defineProps<{
  content: ContentItem[]
  hasContent: boolean
  prayedMarked: boolean
  submitting: boolean
}>()

defineEmits<{
  pray: []
}>()

const copyrightNotices = computed(() => {
  const translations = extractTranslations(props.content)
  return getCopyrightNotices(translations)
})
</script>

<style scoped>
:deep(h2) {
  text-transform: uppercase;
  font-size: 1.5rem !important;
  font-weight: 700;
}
:deep(p) {
  font-size: 1rem;
}
</style>
