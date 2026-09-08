<template>
  <div ref="container" class="church-map w-full h-full rounded-lg overflow-hidden" />
</template>

<script setup lang="ts">
import mapboxgl from 'mapbox-gl'
import type { ExpressionSpecification, GeoJSONSource, MapMouseEvent } from 'mapbox-gl'
import type { FeatureCollection } from 'geojson'
import 'mapbox-gl/dist/mapbox-gl.css'

export interface ChurchMapPoint {
  id: number
  latitude: number
  longitude: number
  name: string
  town: string | null
  pastor_name: string | null
  service_language: string | null
  congregation_size: number | null
}

const props = defineProps<{
  points: ChurchMapPoint[]
  token: string
}>()

const emit = defineEmits<{
  select: [id: number]
}>()

const { theme } = useTheme()
const container = ref<HTMLElement | null>(null)

const SOURCE_ID = 'churches'
const CLUSTER_LAYER = 'church-clusters'
const CLUSTER_COUNT_LAYER = 'church-cluster-counts'
const POINT_LAYER = 'church-points'
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

function toGeoJson(points: ChurchMapPoint[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: points.map(p => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.longitude, p.latitude] },
      properties: {
        id: p.id,
        name: p.name,
        town: p.town ?? '',
        pastor_name: p.pastor_name ?? '',
        service_language: p.service_language ?? '',
        // Unknown sizes draw as a small congregation rather than vanishing.
        size: p.congregation_size ?? 10
      }
    }))
  }
}

function fitToPoints(points: ChurchMapPoint[]) {
  if (!map || points.length === 0) return
  const bounds = new mapboxgl.LngLatBounds()
  for (const p of points) bounds.extend([p.longitude, p.latitude])
  map.fitBounds(bounds, { padding: 60, maxZoom: 10, duration: 0 })
}

// Sources and layers vanish on every setStyle, so this runs on each style.load.
function addLayers() {
  if (!map || map.getSource(SOURCE_ID)) return

  map.addSource(SOURCE_ID, {
    type: 'geojson',
    data: toGeoJson(props.points),
    cluster: true,
    clusterRadius: 40,
    clusterMaxZoom: 11
  })

  const color = primaryColor()

  map.addLayer({
    id: CLUSTER_LAYER,
    type: 'circle',
    source: SOURCE_ID,
    filter: ['has', 'point_count'],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['get', 'point_count'], 2, 14, 50, 22, 500, 32],
      'circle-color': color,
      'circle-opacity': 0.75,
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#ffffff'
    }
  })

  map.addLayer({
    id: CLUSTER_COUNT_LAYER,
    type: 'symbol',
    source: SOURCE_ID,
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['get', 'point_count_abbreviated'],
      'text-size': 11,
      'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
      'text-allow-overlap': true
    },
    paint: { 'text-color': '#ffffff' }
  })

  const radius: ExpressionSpecification = ['interpolate', ['linear'], ['sqrt', ['get', 'size']], 1, 5, 10, 9, 30, 14, 60, 20]

  map.addLayer({
    id: POINT_LAYER,
    type: 'circle',
    source: SOURCE_ID,
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-radius': radius,
      'circle-color': color,
      'circle-opacity': 0.85,
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#ffffff'
    }
  })
}

function showPopup(e: MapMouseEvent) {
  if (!map) return
  const feature = e.features?.[0]
  if (!feature || feature.geometry.type !== 'Point') return

  const p = feature.properties ?? {}
  const lines = [
    p.name,
    p.town,
    p.pastor_name ? `Pastor: ${p.pastor_name}` : '',
    p.service_language ? `Language: ${p.service_language}` : ''
  ].filter(Boolean)

  popup?.remove()
  // setText, not setHTML: every line is admin-entered data.
  popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 12 })
    .setLngLat(feature.geometry.coordinates as [number, number])
    .setText(lines.join('\n'))
    .addTo(map)
  map.getCanvas().style.cursor = 'pointer'
}

function hidePopup() {
  popup?.remove()
  popup = null
  if (map) map.getCanvas().style.cursor = ''
}

function selectPoint(e: MapMouseEvent) {
  const id = e.features?.[0]?.properties?.id
  if (typeof id === 'number') emit('select', id)
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
  map.once('load', () => fitToPoints(props.points))
  map.on('mousemove', POINT_LAYER, showPopup)
  map.on('mouseleave', POINT_LAYER, hidePopup)
  map.on('click', POINT_LAYER, selectPoint)
  map.on('mouseenter', CLUSTER_LAYER, () => { if (map) map.getCanvas().style.cursor = 'pointer' })
  map.on('mouseleave', CLUSTER_LAYER, () => { if (map) map.getCanvas().style.cursor = '' })
  map.on('click', CLUSTER_LAYER, zoomIntoCluster)
})

watch(() => props.points, (points, previous) => {
  const source = map?.getSource(SOURCE_ID) as GeoJSONSource | undefined
  source?.setData(toGeoJson(points))
  if ((previous?.length ?? 0) === 0) fitToPoints(points)
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
.church-map .mapboxgl-popup-content {
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.4;
  white-space: pre-line;
  background: var(--ui-bg-elevated);
  color: var(--ui-text);
}
.church-map .mapboxgl-popup-content::first-line {
  font-weight: 600;
}
.church-map .mapboxgl-popup-anchor-bottom .mapboxgl-popup-tip { border-top-color: var(--ui-bg-elevated); }
.church-map .mapboxgl-popup-anchor-top .mapboxgl-popup-tip { border-bottom-color: var(--ui-bg-elevated); }
.church-map .mapboxgl-popup-anchor-left .mapboxgl-popup-tip { border-right-color: var(--ui-bg-elevated); }
.church-map .mapboxgl-popup-anchor-right .mapboxgl-popup-tip { border-left-color: var(--ui-bg-elevated); }
</style>
