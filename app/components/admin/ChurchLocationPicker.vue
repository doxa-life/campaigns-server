<template>
  <div ref="container" class="church-location-picker w-full h-full rounded-lg overflow-hidden" />
</template>

<script setup lang="ts">
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

/**
 * Small map with one draggable pin. Dragging the pin, or clicking the map
 * when there is no pin yet, emits the new coordinates; the parent saves them.
 */
const props = defineProps<{
  latitude: number | null
  longitude: number | null
  token: string
}>()

const emit = defineEmits<{
  change: [coords: { latitude: number; longitude: number }]
}>()

const { theme } = useTheme()
const container = ref<HTMLElement | null>(null)

let map: mapboxgl.Map | null = null
let marker: mapboxgl.Marker | null = null

const styleUrl = computed(() =>
  theme.value === 'dark' ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11'
)

function hasCoords(): boolean {
  return props.latitude !== null && props.longitude !== null
}

function emitFromMarker() {
  const lngLat = marker?.getLngLat()
  if (!lngLat) return
  emit('change', {
    latitude: Number(lngLat.lat.toFixed(6)),
    longitude: Number(lngLat.lng.toFixed(6))
  })
}

function placeMarker(lng: number, lat: number) {
  if (!map) return
  if (!marker) {
    marker = new mapboxgl.Marker({ draggable: true, color: '#e11d48' })
      .setLngLat([lng, lat])
      .addTo(map)
    marker.on('dragend', emitFromMarker)
  } else {
    marker.setLngLat([lng, lat])
  }
}

function syncMarker(recenter: boolean) {
  if (!map) return
  if (hasCoords()) {
    placeMarker(props.longitude!, props.latitude!)
    if (recenter) map.jumpTo({ center: [props.longitude!, props.latitude!], zoom: Math.max(map.getZoom(), 9) })
  } else if (marker) {
    marker.remove()
    marker = null
  }
}

onMounted(() => {
  if (!container.value) return

  mapboxgl.accessToken = props.token
  map = new mapboxgl.Map({
    container: container.value,
    style: styleUrl.value,
    projection: 'mercator',
    center: hasCoords() ? [props.longitude!, props.latitude!] : [10, 20],
    zoom: hasCoords() ? 9 : 1,
    renderWorldCopies: false,
    maxPitch: 0,
    pitchWithRotate: false,
    dragRotate: false,
    touchPitch: false
  })
  map.touchZoomRotate.disableRotation()
  map.keyboard.disableRotation()
  map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')

  map.on('click', (e) => {
    if (marker) return
    placeMarker(e.lngLat.lng, e.lngLat.lat)
    emitFromMarker()
  })

  syncMarker(false)
})

watch(() => [props.latitude, props.longitude], () => syncMarker(true))

watch(styleUrl, url => map?.setStyle(url))

onBeforeUnmount(() => {
  marker?.remove()
  marker = null
  map?.remove()
  map = null
})
</script>
