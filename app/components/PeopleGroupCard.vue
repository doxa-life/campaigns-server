<script setup lang="ts">
const { t } = useI18n()

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

const props = defineProps<{
  peopleGroup: PeopleGroupData
  contentId?: string
}>()

function formatPopulation(population: number | null): string {
  if (!population) return ''
  return population.toLocaleString()
}

const mapEmbedUrl = computed(() => {
  const { lat, lng } = props.peopleGroup
  if (!lat || !lng) return null

  // Use OpenStreetMap embed - always available, no API key needed
  const numLat = Number(lat)
  const numLng = Number(lng)
  const bbox = `${numLng - 10},${numLat - 10},${numLng + 10},${numLat + 10}`
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${numLat},${numLng}`
})
</script>

<template>
  <div class="people-group-wrapper">
    <div class="people-group-card">
      <!-- Left column: Header + Description -->
      <div class="left-column">
        <div class="header-row">
          <div v-if="peopleGroup.image_url" class="image-container">
            <img
              :src="peopleGroup.image_url"
              :alt="peopleGroup.name"
              class="people-group-image"
            />
            <UPopover v-if="peopleGroup.picture_credit" :popper="{ placement: 'bottom' }">
              <button class="credit-icon" type="button" aria-label="Photo credit">
                <UIcon name="i-lucide-info" class="w-3.5 h-3.5" />
              </button>
              <template #content>
                <p class="p-2 text-xs text-muted max-w-48">
                  <template v-for="(seg, i) in peopleGroup.picture_credit" :key="i">
                    <a v-if="seg.link" :href="seg.link" target="_blank" rel="noopener noreferrer" class="underline">{{ seg.text }}</a>
                    <span v-else>{{ seg.text }}</span>
                  </template>
                </p>
              </template>
            </UPopover>
          </div>

          <div class="header-content">
            <h3 class="name">{{ peopleGroup.name }}</h3>

            <div class="info-row">
              <div v-if="peopleGroup.country" class="info-item">
                <UIcon name="i-lucide-map-pin" class="icon" />
                <span>{{ peopleGroup.country }}</span>
              </div>
              <div v-if="peopleGroup.population" class="info-item">
                <UIcon name="i-lucide-users" class="icon" />
                <span>{{ formatPopulation(peopleGroup.population) }}</span>
              </div>
              <div v-if="peopleGroup.language" class="info-item">
                <UIcon name="i-lucide-languages" class="icon" />
                <span>{{ peopleGroup.language }}</span>
              </div>
              <div v-if="peopleGroup.religion" class="info-item">
                <UIcon name="i-lucide-church" class="icon" />
                <span>{{ peopleGroup.religion }}</span>
              </div>
            </div>
          </div>
        </div>

        <p v-if="peopleGroup.description" class="description">
          {{ peopleGroup.description }}
        </p>
      </div>

      <!-- Right column: Map spanning full height -->
      <div v-if="mapEmbedUrl" class="map-container">
        <iframe
          :src="mapEmbedUrl"
          :title="t('prayerFuel.mapTitle', { name: peopleGroup.name })"
          class="map-embed"
          loading="lazy"
          frameborder="0"
          scrolling="no"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.people-group-wrapper {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.people-group-card {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

@media (min-width: 640px) {
  .people-group-card {
    flex-direction: row;
    align-items: stretch;
    gap: 1.5rem;
  }
}

/* Left column */
.left-column {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  flex: 1;
}

.header-row {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

@media (min-width: 640px) {
  .header-row {
    flex-direction: row;
    align-items: center;
  }
}

.image-container {
  flex-shrink: 0;
  width: 100px;
  position: relative;
}

.credit-icon {
  position: absolute;
  bottom: 4px;
  right: 4px;
  background: rgba(0, 0, 0, 0.55);
  color: white;
  border-radius: 9999px;
  width: 1.25rem;
  height: 1.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s;
}

.credit-icon:hover {
  background: rgba(0, 0, 0, 0.8);
}

.people-group-image {
  width: 100%;
  height: auto;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 0.5rem;
}

.header-content {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

@media (max-width: 639px) {
  .header-content {
    align-items: center;
    text-align: center;
  }
}

.name {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--ui-text);
  margin: 0;
}

.info-row {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  color: var(--ui-text-muted);
  font-size: 0.9375rem;
}

.info-item .icon {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
}

.description {
  line-height: 1.7;
  color: var(--ui-text);
  margin: 0;
}

@media (max-width: 639px) {
  .description {
    text-align: center;
  }
}

/* Right column: Map */
.map-container {
  flex-shrink: 0;
  border-radius: 0.5rem;
  overflow: hidden;
  width: 100%;
}

@media (min-width: 640px) {
  .map-container {
    width: 300px;
  }
}

.map-embed {
  width: 100%;
  height: 180px;
  display: block;
  border: none;
  border-radius: 0.5rem;
}

@media (min-width: 640px) {
  .map-embed {
    height: 100%;
    min-height: 200px;
  }
}
</style>
