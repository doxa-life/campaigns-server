<template>
  <div class="flex-1 flex flex-col bg-beige-50 dark:bg-elevated">
    <!-- Hero/Search Section -->
    <section class="py-12 md:py-16">
      <div class="max-w-7xl mx-auto px-4 sm:px-6">
        <div class="text-center max-w-3xl mx-auto mb-8">
          <h1 class="text-3xl md:text-5xl font-bold uppercase tracking-wide mb-4">
            <span class="text-default">Doxa.</span>
            <span class="text-muted">Life</span>
          </h1>
          <p class="text-lg text-muted mb-8">
            Find a people group to pray for
          </p>
          <UInput
            v-model="searchQuery"
            placeholder="Search people groups..."
            icon="i-lucide-search"
            size="lg"
            class="max-w-md mx-auto"
          />
        </div>
      </div>
    </section>

    <!-- People Group Grid -->
    <section class="py-8 flex-1">
      <div class="max-w-7xl mx-auto px-4 sm:px-6">
        <!-- Loading State -->
        <div v-if="pending" class="flex justify-center py-12">
          <UIcon name="i-lucide-loader" class="w-10 h-10 animate-spin" />
        </div>

        <!-- Error State -->
        <div v-else-if="error" class="text-center py-12">
          <p class="text-muted">Failed to load people groups. Please try again.</p>
        </div>

        <!-- No Results -->
        <div v-else-if="filteredPeopleGroups.length === 0" class="text-center py-12">
          <p class="text-muted">No people groups found.</p>
        </div>

        <!-- Results count -->
        <p v-if="filteredPeopleGroups.length > 0" class="text-sm text-muted mb-4">
          Showing {{ paginatedPeopleGroups.length }} of {{ filteredPeopleGroups.length }} people groups
        </p>

        <!-- People Group Cards -->
        <div v-if="filteredPeopleGroups.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <NuxtLink
            v-for="pg in paginatedPeopleGroups"
            :key="pg.slug"
            :to="`/${pg.slug}`"
            class="block group"
          >
            <UCard class="h-full transition-shadow hover:shadow-lg">
              <template #header>
                <div class="aspect-square bg-beige-100 dark:bg-gray-800 rounded-t-lg overflow-hidden -mx-4 -mt-4">
                  <img
                    v-if="pg.image_url"
                    :src="pg.image_url"
                    :alt="pg.name"
                    class="w-full h-full object-contain"
                  />
                  <div v-else class="w-full h-full flex items-center justify-center">
                    <UIcon name="i-lucide-image" class="w-12 h-12 text-muted" />
                  </div>
                </div>
              </template>
              <h3 class="text-lg font-semibold text-default mb-2">
                {{ pg.name }}
              </h3>
              <p class="text-sm text-muted line-clamp-3">
                {{ pg.imb_people_description }}
              </p>
            </UCard>
          </NuxtLink>
        </div>

        <!-- Pagination -->
        <div v-if="totalPages > 1" class="flex justify-center mt-8">
          <UPagination
            v-model:page="currentPage"
            :total="filteredPeopleGroups.length"
            :items-per-page="pageSize"
          />
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
const searchQuery = ref('')
const currentPage = ref(1)
const pageSize = 9

const { locale } = useI18n()

const { data, pending, error } = await useFetch('/api/people-groups', {
  query: { fields: 'name,slug,image_url,imb_people_description', lang: locale },
  watch: [locale]
})

const filteredPeopleGroups = computed(() => {
  if (!data.value?.posts) return []

  const query = searchQuery.value.toLowerCase().trim()
  if (!query) return data.value.posts

  return data.value.posts.filter((pg: any) =>
    pg.name.toLowerCase().includes(query) ||
    pg.imb_people_description?.toLowerCase().includes(query)
  )
})

const totalPages = computed(() => Math.ceil(filteredPeopleGroups.value.length / pageSize))

const paginatedPeopleGroups = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return filteredPeopleGroups.value.slice(start, start + pageSize)
})

// Reset to page 1 when search changes
watch(searchQuery, () => {
  currentPage.value = 1
})
</script>
