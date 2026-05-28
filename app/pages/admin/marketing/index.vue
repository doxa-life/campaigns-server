<template>
  <div class="marketing-page">
    <div class="page-header">
      <div>
        <h1>Marketing</h1>
        <p class="subtitle">Send email updates to your subscribers</p>
      </div>
    </div>

    <div class="cards-grid">
      <NuxtLink to="/admin/marketing/emails" class="card">
        <h2>Marketing Emails</h2>
        <p>Create and send marketing emails to subscribers who have opted in to receive updates.</p>
        <div class="card-stats" v-if="stats">
          <span>{{ stats.drafts }} drafts</span>
          <span>{{ stats.sent }} sent</span>
        </div>
      </NuxtLink>

      <NuxtLink to="/admin/marketing/senders" class="card">
        <h2>Senders</h2>
        <p>Manage the From addresses marketing emails can be sent from.</p>
      </NuxtLink>

      <NuxtLink to="/admin/marketing/surveys" class="card">
        <h2>Surveys</h2>
        <p>View and export responses to subscriber surveys.</p>
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: 'auth'
})

const stats = ref<{ drafts: number; sent: number } | null>(null)

onMounted(async () => {
  try {
    const response = await $fetch<{ emails: any[]; count: number }>('/api/admin/marketing/emails')
    const drafts = response.emails.filter(e => e.status === 'draft').length
    const sent = response.emails.filter(e => e.status === 'sent').length
    stats.value = { drafts, sent }
  } catch (error) {
    console.error('Failed to load stats:', error)
  }
})
</script>

<style scoped>
.marketing-page {
  max-width: 1200px;
}

.page-header {
  margin-bottom: 2rem;
}

.page-header h1 {
  margin: 0 0 0.5rem;
}

.subtitle {
  margin: 0;
  color: var(--ui-text-muted);
}

.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.5rem;
}

.card {
  display: block;
  padding: 1.5rem;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-bg-elevated);
  text-decoration: none;
  color: inherit;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.card:hover {
  border-color: var(--ui-text-muted);
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

.card h2 {
  margin: 0 0 0.5rem;
  font-size: 1.25rem;
}

.card p {
  margin: 0 0 1rem;
  color: var(--ui-text-muted);
  font-size: 0.875rem;
}

.card-stats {
  display: flex;
  gap: 1rem;
  font-size: 0.875rem;
  color: var(--ui-text-muted);
}

.card-stats span {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
</style>
