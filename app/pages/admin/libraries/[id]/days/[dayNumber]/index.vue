<template>
  <LibraryDayOverview
    :library-id="libraryId"
    :day-number="dayNumber"
    :breadcrumbs="breadcrumbs"
    :calendar-url="`/admin/libraries/${libraryId}/content`"
    :content-base-url="`/admin/libraries/${libraryId}/days/${dayNumber}/content`"
    :show-public-view-link="true"
    @navigate-previous="navigateToPreviousDay"
    @navigate-next="navigateToNextDay"
    @create-translation="createTranslation"
  />
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: 'auth'
})

const route = useRoute()
const libraryId = computed(() => parseInt(route.params.id as string))
const dayNumber = computed(() => parseInt(route.params.dayNumber as string))

const library = ref<{ name: string } | null>(null)

const breadcrumbs = computed(() => [
  { label: 'Prayer Libraries', to: '/admin/libraries' },
  { label: library.value?.name || 'Library', to: `/admin/libraries/${libraryId.value}/content` },
  { label: `Day ${dayNumber.value}` }
])

async function loadLibrary() {
  try {
    const response = await $fetch<{ library: { name: string } }>(`/api/admin/libraries/${libraryId.value}`)
    library.value = response.library
  } catch (err) {
    console.error('Failed to load library:', err)
  }
}

function navigateToPreviousDay() {
  if (dayNumber.value > 1) {
    navigateTo(`/admin/libraries/${libraryId.value}/days/${dayNumber.value - 1}`)
  }
}

function navigateToNextDay() {
  navigateTo(`/admin/libraries/${libraryId.value}/days/${dayNumber.value + 1}`)
}

function createTranslation(languageCode: string) {
  navigateTo(`/admin/libraries/${libraryId.value}/days/${dayNumber.value}/content/new?lang=${languageCode}`)
}

onMounted(() => {
  loadLibrary()
})
</script>
