<template>
  <div class="verify-page">
    <div class="container">
      <div v-if="pending" class="status-card">
        <div class="spinner"></div>
        <p>{{ $t('campaign.verify.verifying') }}</p>
      </div>

      <div v-else-if="error" class="status-card error">
        <div class="status-header">
          <UIcon name="i-lucide-x-circle" class="status-icon" />
          <h1>{{ $t('campaign.verify.error.title') }}</h1>
        </div>
        <p class="message">{{ errorMessage }}</p>
        <NuxtLink :to="localePath(`/${slug}`)" class="btn-grey">
          {{ $t('campaign.verify.backToCampaign') }}
        </NuxtLink>
      </div>

      <div v-else class="status-card success">
        <div class="status-header">
          <UIcon name="i-lucide-check-circle" class="status-icon" />
          <h1>{{ data?.already_verified ? $t('campaign.verify.alreadyVerified.title') : $t('campaign.verify.success.title') }}</h1>
        </div>
        <p class="message">{{ data?.already_verified ? $t('campaign.verify.alreadyVerified.message', { campaign: peopleGroupTitle }) : $t('campaign.verify.success.message', { campaign: peopleGroupTitle }) }}</p>
        <NuxtLink :to="prayerLink" class="btn-grey">
          {{ $t('campaign.verify.startPraying') }}
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'default'
})

const route = useRoute()
const { t } = useI18n()
const localePath = useLocalePath()

const slug = route.params.slug as string
const token = route.query.token as string

// Verify the token
const { data, pending, error } = await useFetch(`/api/people-groups/${slug}/verify`, {
  query: { token }
})

const peopleGroupTitle = computed(() => data.value?.people_group_name || '')
const prayerLink = computed(() => {
  const basePath = localePath(`/${slug}/prayer`)
  const trackingId = data.value?.tracking_id
  return trackingId ? `${basePath}?uid=${trackingId}` : basePath
})
const errorMessage = computed(() => {
  return t('campaign.verify.error.generic')
})

// Set page title
useHead(() => ({
  title: `${t('campaign.verify.pageTitle')} - ${t('app.title')}`
}))
</script>

<style scoped>
.verify-page {
  min-height: calc(100vh - 200px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.container {
  max-width: 500px;
  width: 100%;
}

.status-card {
  background: var(--bg-soft);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 3rem 2rem;
  text-align: center;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--border);
  border-top: 4px solid var(--text);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 1rem;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.status-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.status-icon {
  font-size: 2.5rem;
  color: var(--text);
  flex-shrink: 0;
}

.status-card h1 {
  font-size: 1.75rem;
  margin: 0;
}

.message {
  color: var(--text-muted, #666);
  margin-bottom: 2rem;
  line-height: 1.6;
}

.btn-grey {
  display: inline-block;
  background: #555;
  color: white;
  border: 2px solid #555;
  padding: 0.75rem 1.5rem;
  border-radius: 6px;
  text-decoration: none;
  font-weight: 600;
  transition: all 0.2s;
}

.btn-grey:hover {
  background: #444;
  border-color: #444;
  transform: translateY(-1px);
}

@media (max-width: 768px) {
  .status-card {
    padding: 2rem 1.5rem;
  }

  .status-card h1 {
    font-size: 1.5rem;
  }
}
</style>
