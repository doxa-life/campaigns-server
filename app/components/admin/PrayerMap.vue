<template>
  <div ref="container" class="prayer-map w-full h-full rounded-lg overflow-hidden" />
</template>

<script setup lang="ts">
import mapboxgl from 'mapbox-gl'
import type { ExpressionSpecification, MapMouseEvent } from 'mapbox-gl'
import type { GeoJsonProperties } from 'geojson'
import 'mapbox-gl/dist/mapbox-gl.css'

export interface PrayerMapCountry {
  /** ISO 3166-1 alpha-2. */
  country: string
  name: string
  count: number
}

const props = defineProps<{
  countries: PrayerMapCountry[]
  token: string
}>()

const { theme } = useTheme()
const container = ref<HTMLElement | null>(null)

const SOURCE_ID = 'country-boundaries'
const SOURCE_LAYER = 'country_boundaries'
const FILL_LAYER = 'prayer-country-fill'
const OUTLINE_LAYER = 'prayer-country-outline'
const FALLBACK_COLOR = '#92b195'

let map: mapboxgl.Map | null = null
let popup: mapboxgl.Popup | null = null

const styleUrl = computed(() =>
  theme.value === 'dark' ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11'
)

const countByCode = computed(() => new Map(props.countries.map(c => [c.country, c])))

// Mapbox paint properties need a concrete colour, not a CSS variable.
function primaryColor(): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--ui-primary').trim()
  return /^(#|rgb)/.test(value) ? value : FALLBACK_COLOR
}

// The tileset carries one polygon per worldview; keep a single one so a
// country is not drawn (and shaded) several times over.
const SINGLE_WORLDVIEW: ExpressionSpecification = [
  'any',
  ['==', ['get', 'worldview'], 'all'],
  ['in', 'US', ['get', 'worldview']]
]

// Expression giving each country polygon its count (0 when nobody prayed there).
function countExpression(): ExpressionSpecification {
  if (props.countries.length === 0) return ['literal', 0]
  const expression: unknown[] = ['match', ['get', 'iso_3166_1']]
  for (const c of props.countries) expression.push(c.country, c.count)
  expression.push(0)
  return expression as ExpressionSpecification
}

// Shade by count: transparent at zero, then from a light tint for one person
// up to a solid fill for the busiest country in the current window.
function applyCounts() {
  if (!map?.getLayer(FILL_LAYER)) return
  const count = countExpression()
  const max = Math.max(1, ...props.countries.map(c => c.count))
  const stops = max > 1
    ? [0, 0, 1, 0.3, Math.sqrt(max), 0.85]
    : [0, 0, 1, 0.85]
  map.setPaintProperty(FILL_LAYER, 'fill-opacity', ['interpolate', ['linear'], ['sqrt', count], ...stops])
  map.setPaintProperty(OUTLINE_LAYER, 'line-opacity', ['case', ['>', count, 0], 0.9, 0])
}

// Sources and layers vanish on every setStyle, so this runs on each style.load.
function addLayers() {
  if (!map || map.getSource(SOURCE_ID)) return

  map.addSource(SOURCE_ID, { type: 'vector', url: 'mapbox://mapbox.country-boundaries-v1' })
  map.addLayer({
    id: FILL_LAYER,
    type: 'fill',
    source: SOURCE_ID,
    'source-layer': SOURCE_LAYER,
    filter: SINGLE_WORLDVIEW,
    paint: { 'fill-color': primaryColor(), 'fill-opacity': 0 }
  })
  map.addLayer({
    id: OUTLINE_LAYER,
    type: 'line',
    source: SOURCE_ID,
    'source-layer': SOURCE_LAYER,
    filter: SINGLE_WORLDVIEW,
    paint: { 'line-color': primaryColor(), 'line-width': 1, 'line-opacity': 0 }
  })
  applyCounts()
}

function showPopup(e: MapMouseEvent) {
  if (!map) return
  const properties: GeoJsonProperties = e.features?.[0]?.properties ?? null
  const code = properties?.iso_3166_1 as string | undefined
  const entry = code ? countByCode.value.get(code) : undefined
  if (!entry) {
    hidePopup()
    return
  }

  const people = `${entry.count} ${entry.count === 1 ? 'person' : 'people'}`
  popup?.remove()
  popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 12 })
    .setLngLat(e.lngLat)
    .setText(`${entry.name} · ${people}`)
    .addTo(map)
  map.getCanvas().style.cursor = 'pointer'
}

function hidePopup() {
  popup?.remove()
  popup = null
  if (map) map.getCanvas().style.cursor = ''
}

onMounted(() => {
  if (!container.value) return

  mapboxgl.accessToken = props.token
  map = new mapboxgl.Map({
    container: container.value,
    style: styleUrl.value,
    projection: 'mercator',
    center: [10, 20],
    zoom: 1,
    renderWorldCopies: false,
    maxPitch: 0,
    pitchWithRotate: false,
    dragRotate: false,
    touchPitch: false
  })
  map.touchZoomRotate.disableRotation()
  map.keyboard.disableRotation()
  map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')

  map.on('style.load', addLayers)
  map.on('mousemove', FILL_LAYER, showPopup)
  map.on('mouseleave', FILL_LAYER, hidePopup)
})

watch(() => props.countries, applyCounts)

watch(styleUrl, url => map?.setStyle(url))

onBeforeUnmount(() => {
  hidePopup()
  map?.remove()
  map = null
})
</script>

<style>
/* Popups mount inside the map container, out of reach of scoped styles. */
.prayer-map .mapboxgl-popup-content {
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  background: var(--ui-bg-elevated);
  color: var(--ui-text);
}
.prayer-map .mapboxgl-popup-anchor-bottom .mapboxgl-popup-tip { border-top-color: var(--ui-bg-elevated); }
.prayer-map .mapboxgl-popup-anchor-top .mapboxgl-popup-tip { border-bottom-color: var(--ui-bg-elevated); }
.prayer-map .mapboxgl-popup-anchor-left .mapboxgl-popup-tip { border-right-color: var(--ui-bg-elevated); }
.prayer-map .mapboxgl-popup-anchor-right .mapboxgl-popup-tip { border-left-color: var(--ui-bg-elevated); }
</style>
