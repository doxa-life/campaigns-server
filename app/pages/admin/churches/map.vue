<template>
  <div class="church-map-page">
    <div class="page-header">
      <div>
        <h1>Church map</h1>
        <p v-if="churches" class="summary">
          {{ located.length }} of {{ churches.length }} {{ churches.length === 1 ? 'church' : 'churches' }} on the map
        </p>
      </div>
      <UButton to="/admin/churches" variant="outline" icon="i-lucide-list">All churches</UButton>
    </div>

    <div v-if="error" class="error">Failed to load churches</div>

    <div v-else class="map-layout">
      <div class="map-column">
        <UAlert
          v-if="!mapboxToken"
          color="neutral"
          variant="subtle"
          icon="i-lucide-map-pin-off"
          title="Map not configured"
          description="Set NUXT_PUBLIC_MAPBOX_TOKEN to show the map."
        />
        <div v-else class="map-frame">
          <LazyAdminChurchMap :points="located" :token="mapboxToken" @select="openChurch" />
          <div v-if="status === 'pending'" class="map-loading">
            <UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-[var(--ui-text-dimmed)]" />
          </div>
        </div>
        <p class="attribution">
          Locations looked up with
          <a href="https://nominatim.openstreetmap.org/" target="_blank" rel="noopener">Nominatim</a>,
          data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>.
        </p>
      </div>

      <aside class="unlocated-panel">
        <h2>Not on the map</h2>
        <p v-if="unlocated.length === 0" class="empty">Every church has a location.</p>
        <ul v-else class="unlocated-list">
          <li v-for="church in unlocated" :key="church.id">
            <NuxtLink :to="`/admin/churches/${church.id}`" class="unlocated-item">
              <span class="unlocated-name">{{ church.name }}</span>
              <span class="unlocated-meta">
                <span v-if="church.town">{{ church.town }}</span>
                <UBadge :label="churchLocationStatusLabel(church.location_status)" :color="churchLocationStatusColor(church.location_status)" variant="subtle" size="xs" />
              </span>
            </NuxtLink>
          </li>
        </ul>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { churchLocationStatusColor, churchLocationStatusLabel, hasChurchCoordinates, type ChurchRecord } from '#shared/churches'
import type { ChurchMapPoint } from '~/components/admin/ChurchMap.vue'

definePageMeta({
  layout: 'admin',
  middleware: 'auth'
})

const mapboxToken = useRuntimeConfig().public.mapboxToken as string

const { data, status, error } = useFetch<{ churches: ChurchRecord[] }>('/api/admin/churches')

const churches = computed(() => data.value?.churches)

const located = computed<ChurchMapPoint[]>(() =>
  (churches.value ?? []).filter(hasChurchCoordinates).map(c => ({
    id: c.id,
    latitude: c.latitude!,
    longitude: c.longitude!,
    name: c.name,
    town: c.town,
    pastor_name: c.pastor_name,
    service_language: c.service_language,
    congregation_size: c.congregation_size
  }))
)

const unlocated = computed(() => (churches.value ?? []).filter(c => !hasChurchCoordinates(c)))

function openChurch(id: number) {
  navigateTo(`/admin/churches/${id}`)
}
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1.5rem;
}

.summary {
  color: var(--ui-text-muted);
  font-size: 0.875rem;
  margin-top: 0.25rem;
}

.error {
  text-align: center;
  padding: 2rem;
  color: var(--ui-text-muted);
}

.map-layout {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
}

.map-column {
  flex: 1;
  min-width: 0;
}

.map-frame {
  position: relative;
  height: calc(100vh - 220px);
  min-height: 420px;
}

.map-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--ui-bg) 50%, transparent);
}

.attribution {
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: var(--ui-text-muted);
}

.attribution a {
  text-decoration: underline;
  text-underline-offset: 2px;
}

.unlocated-panel {
  width: 280px;
  flex-shrink: 0;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  padding: 1rem;
  max-height: calc(100vh - 220px);
  overflow-y: auto;
}

.unlocated-panel h2 {
  font-size: 0.875rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
}

.empty {
  font-size: 0.875rem;
  color: var(--ui-text-muted);
}

.unlocated-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.unlocated-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem 0.625rem;
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  font-size: 0.875rem;
}

.unlocated-item:hover {
  background: var(--ui-bg-elevated);
}

.unlocated-name {
  font-weight: 500;
}

.unlocated-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: var(--ui-text-muted);
}

@media (max-width: 900px) {
  .map-layout {
    flex-direction: column;
    align-items: stretch;
  }

  .unlocated-panel {
    width: 100%;
    max-height: none;
  }

  .map-frame {
    height: 60vh;
  }
}
</style>
