<template>
  <div class="update-page">
    <div v-if="loadingAdoption" class="loading">Loading...</div>

    <div v-else-if="errorMessage" class="error-state">
      <h2>Unable to load</h2>
      <p>{{ errorMessage }}</p>
    </div>

    <div v-else-if="adoption" class="update-container">
      <div v-if="submitted" class="success-state">
        <UIcon name="i-lucide-check-circle" class="success-icon" />
        <h2>Thank you for your update!</h2>
        <p>Your report for <strong>{{ adoption.people_group_name }}</strong> has been submitted.</p>
      </div>

      <template v-else>
        <div class="update-header">
          <h1>Adoption Update</h1>
          <p class="subtitle">
            <strong>{{ adoption.group_name }}</strong> &mdash; {{ adoption.people_group_name }}
          </p>
        </div>

        <form @submit.prevent="submitReport" class="update-form">
          <UFormField label="How many people are praying?">
            <UInput v-model.number="form.praying_count" type="number" min="0" class="w-full" />
          </UFormField>

          <UFormField label="Stories from prayer times">
            <UTextarea v-model="form.stories" :rows="4" class="w-full" placeholder="Share any stories or testimonies..." />
          </UFormField>

          <UFormField label="Comments or questions">
            <UTextarea v-model="form.comments" :rows="3" class="w-full" placeholder="Any comments or questions for the team..." />
          </UFormField>

          <UButton type="submit" :loading="submitting" size="lg" class="submit-btn">
            Submit Update
          </UButton>
        </form>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const token = route.params.token as string

const adoption = ref<{
  id: number
  people_group_name: string
  people_group_slug: string | null
  group_name: string
  status: string
  adopted_at: string | null
} | null>(null)

const loadingAdoption = ref(true)
const errorMessage = ref('')
const submitting = ref(false)
const submitted = ref(false)

const form = ref({
  praying_count: null as number | null,
  stories: '',
  comments: ''
})

onMounted(async () => {
  try {
    const res = await $fetch<{ adoption: typeof adoption.value }>(`/api/adoption/update/${token}`)
    adoption.value = res.adoption
  } catch (err: any) {
    errorMessage.value = err.data?.statusMessage || 'This link is not valid.'
  } finally {
    loadingAdoption.value = false
  }
})

async function submitReport() {
  try {
    submitting.value = true
    await $fetch(`/api/adoption/update/${token}`, {
      method: 'POST',
      body: {
        praying_count: form.value.praying_count,
        stories: form.value.stories,
        comments: form.value.comments
      }
    })
    submitted.value = true
  } catch (err: any) {
    errorMessage.value = err.data?.statusMessage || 'Failed to submit report.'
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.update-page {
  max-width: 600px;
  margin: 2rem auto;
  padding: 0 1rem;
}

.loading {
  text-align: center;
  padding: 4rem;
  color: var(--ui-text-muted);
}

.error-state {
  text-align: center;
  padding: 4rem 2rem;
}

.error-state h2 {
  margin-bottom: 0.5rem;
}

.error-state p {
  color: var(--ui-text-muted);
}

.update-container {
  background-color: var(--ui-bg-elevated);
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  padding: 2rem;
}

.success-state {
  text-align: center;
  padding: 2rem 0;
}

.success-icon {
  width: 3rem;
  height: 3rem;
  color: var(--ui-color-success);
  margin-bottom: 1rem;
}

.success-state h2 {
  margin-bottom: 0.5rem;
}

.success-state p {
  color: var(--ui-text-muted);
}

.update-header {
  margin-bottom: 2rem;
}

.update-header h1 {
  margin-bottom: 0.5rem;
}

.subtitle {
  color: var(--ui-text-muted);
  font-size: 1rem;
}

.update-form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.submit-btn {
  align-self: flex-start;
  margin-top: 0.5rem;
}
</style>
