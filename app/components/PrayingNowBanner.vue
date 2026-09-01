<script setup lang="ts">
// "X people praying with you" — a global, site-wide count of prayer sessions
// currently in progress, shown at the top of the prayer page.
//
// Fetched once on load, not polled: /api/people-groups/statistics is served
// with a 5-minute CDN cache, so polling would re-read the same snapshot.
//
// Deliberately not awaited. With `lazy` the await would resolve immediately
// anyway, and skipping it keeps this a plain synchronous component rather than
// an async one the surrounding page has to suspend on.
//
// The viewer is NOT subtracted from the count. In principle you are inside your
// own number, but the response is a cached snapshot up to 5 minutes old, so your
// session is essentially never in the figure you receive — subtracting would
// under-count more often than it would correct.
const { data } = useFetch<{ praying_now?: number }>('/api/people-groups/statistics', {
  key: 'praying-now',
  lazy: true,
  server: false
})

// Hidden at zero and on any failure: an absent line reads better than
// "0 people praying with you".
const prayingNow = computed(() => {
  const count = data.value?.praying_now
  return typeof count === 'number' && count > 0 ? count : null
})
</script>

<template>
  <p v-if="prayingNow" class="text-muted text-center text-sm mt-2">
    <UIcon name="i-lucide-users" class="w-4 h-4 inline-block align-text-bottom mr-1" />
    {{ $t('prayerFuel.prayingWithYou', prayingNow) }}
  </p>
</template>
