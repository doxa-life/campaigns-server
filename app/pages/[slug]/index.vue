<template>
  <div class="min-h-[calc(100vh-200px)]">
    <div v-if="pending" class="flex flex-col items-center justify-center min-h-[50vh] text-center p-8">
      <UIcon name="i-lucide-loader" class="w-10 h-10 animate-spin mb-4" />
      <p>{{ $t('campaign.loading') }}</p>
    </div>

    <div v-else-if="error" class="flex flex-col items-center justify-center min-h-[50vh] text-center p-8">
      <h2 class="text-2xl font-bold mb-4">{{ $t('campaign.notFound.title') }}</h2>
      <p class="text-muted mb-6">{{ $t('campaign.notFound.message') }}</p>
      <UButton to="/">{{ $t('campaign.notFound.goHome') }}</UButton>
    </div>

    <div v-else-if="pgData" class="people-group-content">

      <!-- Sign Up CTA -->
      <div class="max-w-5xl mx-auto px-4 pt-6 flex justify-center">
        <UButton
          size="lg"
          class="rounded-full px-8"
          @click="scrollToSignup"
        >
          {{ $t('campaign.signupButton') }}
        </UButton>
      </div>

      <!-- People Group Section -->
      <section v-if="peopleGroup" class="py-12 bg-default">
        <div class="max-w-5xl mx-auto px-4 space-y-8">

          <!-- Header: Image, Name, Description -->
          <div class="flex flex-col sm:flex-row gap-6 items-start">
            <!-- Image -->
            <div v-if="peopleGroup.image_url" class="shrink-0 w-50 mx-auto sm:mx-0">
              <img
                :src="peopleGroup.image_url"
                :alt="peopleGroup.name"
                class="w-full aspect-square object-cover rounded-lg shadow-md"
              />
            </div>

            <!-- Name & Description -->
            <div class="flex-1 text-center sm:text-left">
              <h2 class="text-2xl md:text-3xl font-bold text-default mb-4">
                {{ peopleGroup.name }}
              </h2>
              <p v-if="peopleGroup.generatedDescription" class="text-muted leading-relaxed mb-4">
                {{ peopleGroup.generatedDescription }}
              </p>
              <UButton
                :href="`https://doxa.life/research/${slug}/`"
                target="_blank"
                variant="outline"
                size="sm"
                class="rounded-full"
              >
                {{ $t('campaign.peopleGroup.findOutMore') }}
                <UIcon name="i-lucide-external-link" class="w-4 h-4 ml-1" />
              </UButton>
            </div>
          </div>

          <!-- Info Blocks Grid -->
          <div class="grid md:grid-cols-3 gap-6">

            <!-- Map -->
            <div v-if="peopleGroup.metadata?.imb_lat && peopleGroup.metadata?.imb_lng" class="bg-beige-100 dark:bg-elevated rounded-2xl overflow-hidden md:order-3">
              <div class="relative h-full min-h-48">
                <iframe
                  :src="`https://www.openstreetmap.org/export/embed.html?bbox=${Number(peopleGroup.metadata.imb_lng) - 10},${Number(peopleGroup.metadata.imb_lat) - 10},${Number(peopleGroup.metadata.imb_lng) + 10},${Number(peopleGroup.metadata.imb_lat) + 10}&layer=mapnik&marker=${peopleGroup.metadata.imb_lat},${peopleGroup.metadata.imb_lng}`"
                  class="absolute inset-0 w-full h-full border-0"
                  loading="lazy"
                ></iframe>
                <!-- Overlay to prevent scroll zoom while allowing click-through -->
                <div class="absolute inset-0 z-10" @wheel.prevent @click="($event.currentTarget as HTMLElement).style.display = 'none'"></div>
              </div>
            </div>

            <!-- Overview Data Block -->
            <div class="bg-beige-100 dark:bg-elevated rounded-2xl p-6 md:order-2">
              <h3 class="font-bold text-default uppercase tracking-wide text-center mb-4">{{ $t('campaign.peopleGroup.overview.title') }}</h3>
              <div class="space-y-3 text-sm">
                <div v-if="peopleGroup.labels?.imb_isoalpha3 || peopleGroup.metadata?.imb_isoalpha3" class="flex items-center gap-2">
                  <UIcon name="i-lucide-map-pin" class="w-4 h-4 text-muted" />
                  <span class="font-medium text-default">{{ $t('campaign.peopleGroup.overview.country') }}</span>
                  <span class="text-muted">{{ peopleGroup.labels?.imb_isoalpha3 || peopleGroup.metadata.imb_isoalpha3 }}</span>
                </div>
                <div v-if="peopleGroup.metadata?.imb_population" class="flex items-center gap-2">
                  <UIcon name="i-lucide-users" class="w-4 h-4 text-muted" />
                  <span class="font-medium text-default">{{ $t('campaign.peopleGroup.overview.population') }}</span>
                  <span class="text-muted">{{ Number(peopleGroup.metadata.imb_population).toLocaleString() }}</span>
                </div>
                <div v-if="peopleGroup.labels?.imb_reg_of_language || peopleGroup.metadata?.imb_reg_of_language" class="flex items-center gap-2">
                  <UIcon name="i-lucide-languages" class="w-4 h-4 text-muted" />
                  <span class="font-medium text-default">{{ $t('campaign.peopleGroup.overview.language') }}</span>
                  <span class="text-muted">{{ peopleGroup.labels?.imb_reg_of_language || peopleGroup.metadata.imb_reg_of_language }}</span>
                </div>
                <div v-if="peopleGroup.labels?.imb_reg_of_religion || peopleGroup.labels?.imb_reg_of_religion_3 || peopleGroup.metadata?.imb_reg_of_religion" class="flex items-center gap-2">
                  <UIcon name="i-lucide-flame" class="w-4 h-4 text-muted" />
                  <span class="font-medium text-default">{{ $t('campaign.peopleGroup.overview.religion') }}</span>
                  <span class="text-muted">{{ peopleGroup.labels?.imb_reg_of_religion || peopleGroup.labels?.imb_reg_of_religion_3 || peopleGroup.metadata.imb_reg_of_religion }}</span>
                </div>
                <div v-if="peopleGroup.labels?.imb_engagement_status || peopleGroup.metadata?.imb_engagement_status" class="flex items-center gap-2">
                  <UIcon name="i-lucide-target" class="w-4 h-4 text-muted" />
                  <span class="font-medium text-default">{{ $t('campaign.peopleGroup.overview.status') }}</span>
                  <span class="text-muted">{{ peopleGroup.labels?.imb_engagement_status || peopleGroup.metadata.imb_engagement_status }}</span>
                </div>
                <div v-if="peopleGroup.labels?.imb_congregation_existing || peopleGroup.metadata?.imb_congregation_existing !== undefined" class="flex items-center gap-2">
                  <UIcon name="i-lucide-church" class="w-4 h-4 text-muted" />
                  <span class="font-medium text-default">{{ $t('campaign.peopleGroup.overview.churches') }}</span>
                  <span class="text-muted">{{ peopleGroup.labels?.imb_congregation_existing || (peopleGroup.metadata.imb_congregation_existing === '1' || peopleGroup.metadata.imb_congregation_existing === 1 ? $t('common.yes') : $t('common.no')) }}</span>
                </div>
              </div>
            </div>

            <!-- Prayer Status Block -->
            <div class="bg-forest-500 rounded-2xl p-6 text-white md:order-1">
              <h3 class="font-bold uppercase tracking-wide text-center mb-4">{{ $t('campaign.peopleGroup.prayerStatus.title') }}</h3>
              <div class="text-center">
                <div class="text-5xl font-bold mb-2">
                  {{ pgData.people_praying || 0 }} / {{ PRAYER_GOAL }}
                </div>
                <p class="text-sage-200 text-sm mb-6">
                  {{ $t('campaign.peopleGroup.prayerStatus.description') }}
                </p>
                <!-- Progress Bar -->
                <div class="w-full bg-forest-600 rounded-full h-3">
                  <div
                    class="bg-sage-300 h-3 rounded-full transition-all duration-500"
                    :style="{ width: `${Math.min(((pgData.people_praying || 0) / PRAYER_GOAL) * 100, 100)}%` }"
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Why Pray + Sample Content Section -->
      <section class="py-12 bg-elevated">
        <div class="max-w-5xl mx-auto px-4">

          <div class="grid md:grid-cols-2 gap-8">
            <!-- Left: Why Pray Cards -->
            <div class="space-y-4">
              <h2 class="text-2xl font-bold text-default text-center mb-8">{{ $t('campaign.whyPray.title') }}</h2>
              <!-- Card 1: They Have No One -->
              <div class="p-5 bg-beige-100 dark:bg-elevated rounded-xl">
                <div class="flex items-start gap-4">
                  <div class="w-10 h-10 rounded-full bg-forest-500 flex items-center justify-center shrink-0">
                    <UIcon name="i-lucide-globe" class="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 class="font-semibold text-default mb-1">{{ $t('campaign.whyPray.noOne.title') }}</h3>
                    <p class="text-muted leading-relaxed">{{ $t('campaign.whyPray.noOne.description') }}</p>
                  </div>
                </div>
              </div>

              <!-- Card 2: Prayer Opens Doors -->
              <div class="p-5 bg-beige-100 dark:bg-elevated rounded-xl">
                <div class="flex items-start gap-4">
                  <div class="w-10 h-10 rounded-full bg-forest-500 flex items-center justify-center shrink-0">
                    <UIcon name="i-lucide-door-open" class="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 class="font-semibold text-default mb-1">{{ $t('campaign.whyPray.opensDoors.title') }}</h3>
                    <p class="text-muted leading-relaxed">{{ $t('campaign.whyPray.opensDoors.description') }}</p>
                  </div>
                </div>
              </div>

              <!-- Card 3: You Will Be Changed -->
              <div class="p-5 bg-beige-100 dark:bg-elevated rounded-xl">
                <div class="flex items-start gap-4">
                  <div class="w-10 h-10 rounded-full bg-forest-500 flex items-center justify-center shrink-0">
                    <UIcon name="i-lucide-sparkles" class="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 class="font-semibold text-default mb-1">{{ $t('campaign.whyPray.changed.title') }}</h3>
                    <p class="text-muted leading-relaxed">{{ $t('campaign.whyPray.changed.description') }}</p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Right: Sample Prayer Content -->
            <div>
              <h2 class="text-2xl font-bold text-default text-center mb-8">{{ $t('campaign.sampleContent.title') }}</h2>
              <UCard>
                <div class="space-y-5 p-4">
                  <!-- People Group Name (dynamic) -->
                  <div>
                    <h3 class="text-base font-semibold text-default mb-2 flex items-center gap-2">
                      <UIcon name="i-lucide-users" class="w-4 h-4 text-forest-500" />
                      {{ peopleGroup?.name || $t('campaign.sampleContent.peopleGroupName') }}
                    </h3>
                    <div class="space-y-2">
                      <div class="h-3 bg-gray-300 dark:bg-gray-700 rounded animate-pulse"></div>
                      <div class="h-3 bg-gray-300 dark:bg-gray-700 rounded animate-pulse w-5/6"></div>
                    </div>
                  </div>

                  <!-- Scripture -->
                  <div>
                    <h3 class="text-base font-semibold text-default mb-2 flex items-center gap-2">
                      <UIcon name="i-lucide-book-open" class="w-4 h-4 text-forest-500" />
                      {{ $t('campaign.sampleContent.scripture') }}
                    </h3>
                    <div class="bg-beige-100 dark:bg-default rounded-lg p-3 border-l-4 border-forest-500">
                      <div class="space-y-2">
                        <div class="h-3 bg-gray-300 dark:bg-gray-700 rounded animate-pulse"></div>
                        <div class="h-3 bg-gray-300 dark:bg-gray-700 rounded animate-pulse w-4/5"></div>
                      </div>
                      <div class="h-2 bg-gray-300 dark:bg-gray-700 rounded animate-pulse w-1/4 mt-2"></div>
                    </div>
                  </div>

                  <!-- Prayer Points -->
                  <div>
                    <h3 class="text-base font-semibold text-default mb-2 flex items-center gap-2">
                      <UIcon name="i-lucide-hand" class="w-4 h-4 text-forest-500" />
                      {{ $t('campaign.sampleContent.prayerPoints') }}
                    </h3>
                    <div class="space-y-2">
                      <div class="flex items-center gap-2">
                        <div class="w-1.5 h-1.5 rounded-full bg-forest-500 shrink-0"></div>
                        <div class="h-3 bg-gray-300 dark:bg-gray-700 rounded animate-pulse flex-1"></div>
                      </div>
                      <div class="flex items-center gap-2">
                        <div class="w-1.5 h-1.5 rounded-full bg-forest-500 shrink-0"></div>
                        <div class="h-3 bg-gray-300 dark:bg-gray-700 rounded animate-pulse flex-1 w-4/5"></div>
                      </div>
                      <div class="flex items-center gap-2">
                        <div class="w-1.5 h-1.5 rounded-full bg-forest-500 shrink-0"></div>
                        <div class="h-3 bg-gray-300 dark:bg-gray-700 rounded animate-pulse flex-1 w-3/4"></div>
                      </div>
                    </div>
                  </div>

                  <!-- People Group of the Day -->
                  <div>
                    <h3 class="text-base font-semibold text-default mb-2 flex items-center gap-2">
                      <UIcon name="i-lucide-globe" class="w-4 h-4 text-forest-500" />
                      {{ $t('campaign.sampleContent.peopleGroupOfDay') }}
                    </h3>
                    <div class="flex gap-3">
                      <div class="w-12 h-12 bg-gray-300 dark:bg-gray-700 rounded-lg animate-pulse shrink-0"></div>
                      <div class="flex-1 space-y-2">
                        <div class="h-3 bg-gray-300 dark:bg-gray-700 rounded animate-pulse w-1/3"></div>
                        <div class="h-3 bg-gray-300 dark:bg-gray-700 rounded animate-pulse w-4/5"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </UCard>
            </div>
          </div>
        </div>
      </section>

      <!-- Prayer Signup Section -->
      <section id="signup-section" class="py-12 bg-accented">
        <div class="max-w-5xl mx-auto px-4">
          <UCard>
            <template #header>
              <div class="text-center">
                <h2 class="text-2xl font-bold">{{ $t('campaign.signup.title') }}</h2>
                <p class="text-muted mt-2">{{ $t('campaign.signup.description') }}</p>
                <UAlert
                  v-if="isStartDateFuture"
                  color="neutral"
                  icon="i-lucide-calendar-clock"
                  :title="$t('campaign.startsOn.message', { date: formattedStartDate })"
                  class="mt-4 text-left"
                />
              </div>
            </template>

            <form @submit.prevent="handleSignup" class="grid md:grid-cols-2 gap-8">
              <!-- Left side: Visual selectors -->
              <div class="space-y-6">
                <!-- Frequency as visual cards -->
                <div>
                  <label class="text-sm font-medium mb-3 block">{{ $t('campaign.signup.form.frequency.label') }}</label>
                  <div class="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      @click="signupForm.frequency = 'daily'"
                      class="relative p-5 rounded-2xl border-2 transition-all group"
                      :class="signupForm.frequency === 'daily'
                        ? 'border-(--ui-text) bg-elevated'
                        : 'border-default hover:border-(--ui-text-muted)'"
                    >
                      <UIcon name="i-lucide-sun" class="w-8 h-8 mb-2" />
                      <span class="block font-semibold">{{ $t('campaign.signup.form.frequency.daily') }}</span>
                      <span v-if="signupForm.frequency === 'daily'" class="absolute top-2 right-2">
                        <UIcon name="i-lucide-check-circle-2" class="w-5 h-5" />
                      </span>
                    </button>
                    <button
                      type="button"
                      @click="signupForm.frequency = 'weekly'"
                      class="relative p-5 rounded-2xl border-2 transition-all group"
                      :class="signupForm.frequency === 'weekly'
                        ? 'border-(--ui-text) bg-elevated'
                        : 'border-default hover:border-(--ui-text-muted)'"
                    >
                      <UIcon name="i-lucide-calendar-days" class="w-8 h-8 mb-2" />
                      <span class="block font-semibold">{{ $t('campaign.signup.form.frequency.weekly') }}</span>
                      <span v-if="signupForm.frequency === 'weekly'" class="absolute top-2 right-2">
                        <UIcon name="i-lucide-check-circle-2" class="w-5 h-5" />
                      </span>
                    </button>
                  </div>
                  <!-- Day selection for weekly frequency -->
                  <div v-if="signupForm.frequency === 'weekly'" class="grid grid-cols-7 gap-1 mt-3">
                    <label
                      v-for="day in translatedDaysOfWeek"
                      :key="day.value"
                      class="flex flex-col items-center gap-1 p-2 border border-default rounded-lg cursor-pointer transition-colors hover:bg-elevated"
                      :class="{ 'border-primary bg-elevated': signupForm.days_of_week.includes(day.value) }"
                    >
                      <UCheckbox
                        :model-value="signupForm.days_of_week.includes(day.value)"
                        @update:model-value="toggleDayOfWeek(day.value)"
                      />
                      <span class="text-xs font-medium">{{ day.label }}</span>
                    </label>
                  </div>
                </div>

                <!-- Duration as slider-style pills -->
                <div>
                  <label class="text-sm font-medium mb-3 block">{{ $t('campaign.signup.form.duration.label') }}</label>
                  <div class="flex rounded-full border border-default p-1 bg-default">
                    <button
                      v-for="dur in [5, 10, 15, 30, 60]"
                      :key="dur"
                      type="button"
                      @click="signupForm.prayer_duration = dur"
                      class="flex-1 py-2 px-3 rounded-full text-sm font-medium transition-all"
                      :class="signupForm.prayer_duration === dur
                        ? 'bg-(--ui-text) text-(--ui-bg)'
                        : 'hover:bg-elevated'"
                    >
                      {{ dur < 60 ? `${dur}m` : '1h' }}
                    </button>
                  </div>
                </div>

                <!-- Time picker -->
                <div>
                  <label class="text-sm font-medium mb-3 block">{{ $t('campaign.signup.form.reminderTime.label') }}</label>
                  <TimePicker
                    v-model="signupForm.reminder_time"
                    size="lg"
                    class="w-full"
                  />
                </div>

                <!-- Timezone -->
                <div>
                  <label class="text-sm font-medium mb-3 block">{{ $t('campaign.signup.form.timezone.label') }}</label>
                  <USelectMenu
                    v-model="userTimezone"
                    :items="timezoneOptions"
                    :search-input="{ placeholder: $t('campaign.signup.form.timezone.searchPlaceholder') }"
                    class="w-full"
                  />
                </div>
              </div>

              <!-- Right side: Contact -->
              <div class="space-y-6">
                <div>
                  <label class="text-sm font-medium mb-3 block">{{ $t('campaign.signup.form.name.label') }}</label>
                  <UInput
                    v-model="signupForm.name"
                    :placeholder="$t('campaign.signup.form.name.placeholder')"
                    size="lg"
                    class="w-full"
                  />
                </div>

                <div>
                  <label class="text-sm font-medium mb-3 block">{{ $t('campaign.signup.form.email.label') }}</label>
                  <UInput
                    v-model="signupForm.email"
                    type="email"
                    :placeholder="$t('campaign.signup.form.email.placeholder')"
                    size="lg"
                    class="w-full"
                  />
                </div>

                <!-- Stay Connected -->
                <div class="border-t border-default pt-4 space-y-3">
                  <p class="text-sm text-muted">
                    {{ $t('campaign.signup.form.consent.description') }}
                  </p>
                  <UCheckbox
                    v-model="signupForm.consent_people_group_updates"
                    :label="$t('campaign.signup.form.consent.campaignUpdates', { campaign: pgData?.title })"
                  />
                  <UCheckbox v-model="signupForm.consent_doxa_general">
                    <template #label>
                      <i18n-t keypath="campaign.signup.form.consent.doxaGeneral" tag="span">
                        <template #link>
                          <a href="https://doxa.life/" target="_blank" class="text-primary hover:underline">DOXA partnership</a>
                        </template>
                      </i18n-t>
                    </template>
                  </UCheckbox>
                </div>

                <UButton
                  type="submit"
                  block
                  size="lg"
                  class="rounded-full"
                  :loading="submitting"
                  :disabled="!signupForm.name || !signupForm.email || (signupForm.frequency === 'weekly' && signupForm.days_of_week.length === 0)"
                >
                  {{ submitting ? $t('campaign.signup.form.submitting') : $t('campaign.signup.form.submit') }}
                </UButton>

                <!-- Error Message -->
                <UAlert v-if="signupError" color="error" :title="signupError" />
              </div>
            </form>
          </UCard>
        </div>
      </section>

      <!-- Prayer Fuel Link Section -->
      <section class="py-12 bg-forest-400">
        <div class="max-w-3xl mx-auto px-4">
          <div class="text-center text-white">
            <h2 class="text-2xl font-bold uppercase tracking-wide mb-3">{{ $t('campaign.prayerFuel.title') }}</h2>
            <p class="text-sage-200 mb-6">{{ $t('campaign.prayerFuel.description') }}</p>
            <UButton
              :to="localePath(`/${pgData.slug}/prayer`)"
              size="lg"
              class="rounded-full px-8"
            >
              {{ $t('campaign.prayerFuel.button') }}
            </UButton>
          </div>
        </div>
      </section>

      <!-- Mobile App Links Section (hidden for now) -->
      <section v-if="false" class="py-12 bg-elevated">
        <div class="max-w-3xl mx-auto px-4">
          <div class="text-center">
            <h2 class="text-2xl font-bold uppercase tracking-wide text-default mb-3">{{ $t('campaign.mobileApp.title') }}</h2>
            <p class="text-muted mb-6">
              {{ $t('campaign.mobileApp.description') }}
            </p>

            <div class="flex gap-4 justify-center flex-wrap">
              <UButton href="#" size="lg" class="rounded-full px-6" :aria-label="$t('campaign.mobileApp.appStore.ariaLabel')">
                <div class="flex flex-col items-start text-left min-w-35">
                  <span class="text-xs opacity-80">{{ $t('campaign.mobileApp.appStore.label') }}</span>
                  <span class="text-lg font-semibold">{{ $t('campaign.mobileApp.appStore.store') }}</span>
                </div>
              </UButton>
              <UButton href="#" size="lg" class="rounded-full px-6" :aria-label="$t('campaign.mobileApp.googlePlay.ariaLabel')">
                <div class="flex flex-col items-start text-left min-w-35">
                  <span class="text-xs opacity-80">{{ $t('campaign.mobileApp.googlePlay.label') }}</span>
                  <span class="text-lg font-semibold">{{ $t('campaign.mobileApp.googlePlay.store') }}</span>
                </div>
              </UButton>
            </div>
          </div>
        </div>
      </section>

      <!-- Email Verification Modal -->
      <UModal v-model:open="showVerificationModal">
        <template #content>
          <div class="p-8 text-center">
            <div class="flex items-center justify-center gap-3 mb-6">
              <UIcon name="i-lucide-mail" class="w-10 h-10 text-default animate-pulse" />
              <h2 class="text-2xl font-semibold">{{ $t('campaign.signup.modal.title') }}</h2>
            </div>
            <p class="text-muted mb-2">{{ $t('campaign.signup.modal.message') }}</p>
            <p class="text-lg font-semibold mb-4 break-all">{{ verificationEmail }}</p>
            <p class="text-sm text-muted mb-8">{{ $t('campaign.signup.modal.hint') }}</p>
            <UButton
              size="lg"
              @click="closeVerificationModal"
            >
              {{ $t('campaign.signup.modal.button') }}
            </UButton>
          </div>
        </template>
      </UModal>
    </div>
  </div>
</template>

<script setup lang="ts">
// Type definitions for API response
interface PeopleGroupResponse {
  people_group: {
    id: number
    slug: string
    title: string
    dt_id: string | null
    people_praying: number
    daily_prayer_duration: number
    people_committed: number
    committed_duration: number
    created_at: string
    updated_at: string
  }
  peopleGroup: {
    id: number
    dt_id: string
    name: string
    image_url: string | null
    metadata: Record<string, any>
    labels: Record<string, string | null>
    generatedDescription: string
    created_at: string
    updated_at: string
  } | null
  globalStartDate: string | null
}

definePageMeta({
  layout: 'default'
})

const route = useRoute()
const slug = route.params.slug as string
const { t, locale } = useI18n()
const localePath = useLocalePath()

// Fetch people group data with locale for translated labels
const { data, pending, error } = await useFetch<PeopleGroupResponse>(`/api/people-groups/${slug}`, {
  query: { locale },
  watch: [locale]
})
const pgData = computed(() => data.value?.people_group)
const peopleGroup = computed(() => data.value?.peopleGroup)
const globalStartDate = computed(() => data.value?.globalStartDate)

// Check if the start date is in the future
const isStartDateFuture = computed(() => {
  if (!globalStartDate.value) return false
  // Parse as local date to avoid timezone issues (YYYY-MM-DD format)
  const [year, month, day] = globalStartDate.value.split('-').map(Number)
  const startDate = new Date(year!, month! - 1, day!)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return startDate > today
})

// Format the start date for display
const formattedStartDate = computed(() => {
  if (!globalStartDate.value) return ''
  // Parse as local date to avoid timezone issues (YYYY-MM-DD format)
  const [year, month, day] = globalStartDate.value.split('-').map(Number)
  const startDate = new Date(year!, month! - 1, day!)
  return startDate.toLocaleDateString(locale.value, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
})

// People group title management
const { setPeopleGroupTitle } = usePeopleGroup()

// Set people group title on mount (handles cached data from navigation)
onMounted(() => {
  if (pgData.value?.title) {
    setPeopleGroupTitle(pgData.value.title)
  }
})

// Dynamic prayer goal - starts at 144, then increases to 1000 once reached
const PRAYER_GOAL = computed(() => {
  const peoplePraying = pgData.value?.people_praying || 0
  return peoplePraying >= 144 ? 1000 : 144
})

// Set people group title when loaded
watch(pgData, (newPgData) => {
  if (newPgData?.title) {
    setPeopleGroupTitle(newPgData.title)
  }
}, { immediate: true })


// Days of week for weekly frequency (translated)
const translatedDaysOfWeek = computed(() => [
  { value: 0, label: t('campaign.signup.form.daysOfWeek.days.sun') },
  { value: 1, label: t('campaign.signup.form.daysOfWeek.days.mon') },
  { value: 2, label: t('campaign.signup.form.daysOfWeek.days.tue') },
  { value: 3, label: t('campaign.signup.form.daysOfWeek.days.wed') },
  { value: 4, label: t('campaign.signup.form.daysOfWeek.days.thu') },
  { value: 5, label: t('campaign.signup.form.daysOfWeek.days.fri') },
  { value: 6, label: t('campaign.signup.form.daysOfWeek.days.sat') }
])

// Get all IANA timezone options
const timezoneOptions = Intl.supportedValuesOf('timeZone')

// Auto-detect user's timezone
const userTimezone = ref('UTC')
onMounted(() => {
  try {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
    userTimezone.value = detected || 'UTC'
  } catch {
    userTimezone.value = 'UTC'
  }
})

// Signup form state
const signupForm = ref({
  name: '',
  delivery_method: 'email',
  email: '',
  frequency: 'daily',
  days_of_week: [] as number[],
  reminder_time: '09:00',
  prayer_duration: 10,
  consent_people_group_updates: false,
  consent_doxa_general: false
})

const submitting = ref(false)
const signupSuccess = ref(false)
const signupError = ref('')

// Email verification modal state
const showVerificationModal = ref(false)
const verificationEmail = ref('')

// Toggle day of week selection
function toggleDayOfWeek(day: number) {
  const index = signupForm.value.days_of_week.indexOf(day)
  if (index === -1) {
    signupForm.value.days_of_week.push(day)
  } else {
    signupForm.value.days_of_week.splice(index, 1)
  }
}

// Reset form helper
function resetForm() {
  signupForm.value = {
    name: '',
    delivery_method: 'email',
    email: '',
    frequency: 'daily',
    days_of_week: [],
    reminder_time: '09:00',
    prayer_duration: 10,
    consent_people_group_updates: false,
    consent_doxa_general: false
  }
}

// Close verification modal
function closeVerificationModal() {
  showVerificationModal.value = false
  verificationEmail.value = ''
}

// Scroll to signup section
function scrollToSignup() {
  const section = document.getElementById('signup-section')
  if (section) {
    section.scrollIntoView({ behavior: 'smooth' })
  }
}

// Handle form submission
async function handleSignup() {
  // Validate weekly frequency has at least one day selected
  if (signupForm.value.frequency === 'weekly' && signupForm.value.days_of_week.length === 0) {
    signupError.value = t('campaign.signup.form.daysOfWeek.error')
    return
  }

  submitting.value = true
  signupSuccess.value = false
  signupError.value = ''

  try {
    const response = await $fetch(`/api/people-groups/${slug}/signup`, {
      method: 'POST',
      body: {
        name: signupForm.value.name,
        email: signupForm.value.email,
        delivery_method: signupForm.value.delivery_method,
        frequency: signupForm.value.frequency,
        days_of_week: signupForm.value.days_of_week,
        reminder_time: signupForm.value.reminder_time,
        prayer_duration: signupForm.value.prayer_duration,
        timezone: userTimezone.value,
        language: locale.value,
        consent_people_group_updates: signupForm.value.consent_people_group_updates,
        consent_doxa_general: signupForm.value.consent_doxa_general
      }
    })

    console.log('Signup successful:', response)

    // For email signups, always show verification modal
    if (signupForm.value.delivery_method === 'email') {
      verificationEmail.value = signupForm.value.email
      showVerificationModal.value = true
      resetForm()
    } else {
      // For non-email signups, show inline success message
      signupSuccess.value = true
      setTimeout(() => {
        resetForm()
        signupSuccess.value = false
      }, 5000)
    }
  } catch (err: any) {
    signupError.value = err.data?.statusMessage || err.message || t('campaign.signup.errors.failed')
  } finally {
    submitting.value = false
  }
}

// Set page title
useHead(() => ({
  title: pgData.value ? `${pgData.value.title} - ${t('app.title')}` : `${t('campaign.pageTitle')} - ${t('app.title')}`
}))
</script>

