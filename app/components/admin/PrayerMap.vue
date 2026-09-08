<template>
  <div ref="container" class="prayer-map w-full h-full rounded-lg overflow-hidden" />
</template>

<script setup lang="ts">
import mapboxgl from 'mapbox-gl'
import type { ExpressionSpecification, GeoJSONSource, MapMouseEvent } from 'mapbox-gl'
import type { FeatureCollection } from 'geojson'
import 'mapbox-gl/dist/mapbox-gl.css'

export interface PrayerMapPoint {
  latitude: number
  longitude: number
  label: string
  count: number
}

const props = defineProps<{
  points: PrayerMapPoint[]
  token: string
}>()

const { theme } = useTheme()
const container = ref<HTMLElement | null>(null)

const SOURCE_ID = 'prayer-points'
const CIRCLE_LAYER = 'prayer-circles'
const COUNT_LAYER = 'prayer-counts'
const FALLBACK_COLOR = '#92b195'

let map: mapboxgl.Map | null = null
let popup: mapboxgl.Popup | null = null

const styleUrl = computed(() =>
  theme.value === 'dark' ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11'
)

// Mapbox paint properties need a concrete colour, not a CSS variable.
function primaryColor(): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--ui-primary').trim()
  return /^(#|rgb)/.test(value) ? value : FALLBACK_COLOR
}

function toGeoJson(points: PrayerMapPoint[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: points.map(p => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.longitude, p.latitude] },
      properties: { label: p.label, count: p.count }
    }))
  }
}

// Sources and layers vanish on every setStyle, so this runs on each style.load.
function addLayers() {
  if (!map || map.getSource(SOURCE_ID)) return

  map.addSource(SOURCE_ID, {
    type: 'geojson',
    data: toGeoJson(props.points),
    cluster: true,
    clusterRadius: 40,
    clusterProperties: { total: ['+', ['get', 'count']] }
  })

  const size: ExpressionSpecification = ['coalesce', ['get', 'total'], ['get', 'count']]

  map.addLayer({
    id: CIRCLE_LAYER,
    type: 'circle',
    source: SOURCE_ID,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['sqrt', size], 1, 7, 10, 13, 100, 22, 1000, 36],
      'circle-color': primaryColor(),
      'circle-opacity': 0.8,
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#ffffff'
    }
  })

  map.addLayer({
    id: COUNT_LAYER,
    type: 'symbol',
    source: SOURCE_ID,
    layout: {
      'text-field': ['to-string', size],
      'text-size': 11,
      'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
      'text-allow-overlap': true
    },
    paint: { 'text-color': '#ffffff' }
  })
}

function showPopup(e: MapMouseEvent) {
  if (!map) return
  const feature = e.features?.[0]
  if (!feature || feature.geometry.type !== 'Point') return

  const p = feature.properties ?? {}
  const count = Number(p.cluster ? p.total : p.count)
  const people = `${count} ${count === 1 ? 'person' : 'people'}`
  const text = p.cluster ? `${people} praying in this area` : `${p.label || 'Unknown location'} · ${people}`

  popup?.remove()
  // setText, not setHTML: the label comes from Cloudflare's city header.
  popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 12 })
    .setLngLat(feature.geometry.coordinates as [number, number])
    .setText(text)
    .addTo(map)
  map.getCanvas().style.cursor = 'pointer'
}

function hidePopup() {
  popup?.remove()
  popup = null
  if (map) map.getCanvas().style.cursor = ''
}

function zoomIntoCluster(e: MapMouseEvent) {
  if (!map) return
  const feature = e.features?.[0]
  if (!feature?.properties?.cluster || feature.geometry.type !== 'Point') return

  const source = map.getSource(SOURCE_ID) as GeoJSONSource
  const center = feature.geometry.coordinates as [number, number]
  source.getClusterExpansionZoom(feature.properties.cluster_id, (err, zoom) => {
    if (err || zoom == null || !map) return
    map.easeTo({ center, zoom })
  })
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
  map.on('mousemove', CIRCLE_LAYER, showPopup)
  map.on('mouseleave', CIRCLE_LAYER, hidePopup)
  map.on('click', CIRCLE_LAYER, zoomIntoCluster)
})

watch(() => props.points, points => {
  const source = map?.getSource(SOURCE_ID) as GeoJSONSource | undefined
  source?.setData(toGeoJson(points))
})

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
