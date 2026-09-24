<template>
  <!-- Both badges and the QR point at the unprefixed /app/<slug> smart link, which
       deep-links into the installed app or falls back to the right store for the device
       (see server/routes/app/[slug].get.ts). -->
  <section class="py-12 bg-default">
    <div class="max-w-5xl mx-auto px-4">
      <div class="bg-forest-500 rounded-2xl p-6 md:p-8 text-white">

        <div class="flex items-center justify-center lg:justify-start gap-5 mb-7">
          <img src="/images/doxa-app-icon.png" alt="" class="w-16 h-16 rounded-2xl bg-white shrink-0" />
          <h2 class="text-2xl font-bold uppercase tracking-wide text-center lg:text-left">
            {{ $t('campaign.appPromo.title', { name }) }}
          </h2>
        </div>

        <div class="flex flex-col lg:flex-row lg:items-center gap-7 lg:gap-10">
          <!-- Apple and Google both require their own artwork, unaltered. The Google badge
               file carries its mandatory clear space inside the image, so it is rendered
               taller than the Apple one to make the two badges read at the same size. -->
          <div class="flex flex-wrap items-center justify-center gap-3 bg-white rounded-xl px-4 py-3 self-center">
            <a :href="`/app/${slug}?store=ios`" class="shrink-0">
              <img :src="appStoreBadge" :alt="$t('campaign.appPromo.appStore.alt')" class="h-11 w-auto" />
            </a>
            <a :href="`/app/${slug}?store=android`" class="shrink-0">
              <img :src="googlePlayBadge" :alt="$t('campaign.appPromo.googlePlay.alt')" class="h-[66px] w-auto" />
            </a>
          </div>

          <ul class="space-y-2.5 self-center">
            <li v-for="benefit in benefits" :key="benefit" class="flex items-center gap-2.5">
              <UIcon name="i-lucide-check" class="w-4 h-4 text-sage-300 shrink-0" />
              <span class="text-sm text-sage-200">{{ benefit }}</span>
            </li>
          </ul>

          <div class="flex flex-col items-center gap-2 lg:ml-auto">
            <img
              v-if="qrDataUrl"
              :src="qrDataUrl"
              :alt="$t('campaign.appPromo.qrAlt', { name })"
              class="w-24 h-24 rounded-lg bg-white p-1.5"
            />
            <div v-else class="w-24 h-24 rounded-lg bg-white/10"></div>
            <p class="text-xs uppercase tracking-wide text-sage-300">
              {{ $t('campaign.appPromo.qrCaption') }}
            </p>
          </div>
        </div>

      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import QRCode from 'qrcode'

const props = defineProps<{
  slug: string
  name: string
}>()

const { t, locale } = useI18n()
const requestUrl = useRequestURL()

// Official artwork, downloaded from Apple's badge tool and Google's badge page and served
// from public/images/badges. Apple publishes no Arabic or Hindi badge — their own tool
// returns the English artwork for those locales, so those locales fall back to it here.
const APP_STORE_BADGE_LOCALES = ['de', 'en', 'es', 'fr', 'it', 'pt', 'ro', 'ru', 'zh']
const GOOGLE_PLAY_BADGE_LOCALES = ['ar', 'de', 'en', 'es', 'fr', 'hi', 'it', 'pt', 'ro', 'ru', 'zh']

function badgeLocale(available: string[]) {
  return available.includes(locale.value) ? locale.value : 'en'
}

const appStoreBadge = computed(() => `/images/badges/app-store-${badgeLocale(APP_STORE_BADGE_LOCALES)}.svg`)
const googlePlayBadge = computed(() => `/images/badges/google-play-${badgeLocale(GOOGLE_PLAY_BADGE_LOCALES)}.png`)

const benefits = computed(() => [
  t('campaign.appPromo.benefits.today'),
  t('campaign.appPromo.benefits.reminders'),
  t('campaign.appPromo.benefits.together')
])

const qrDataUrl = ref<string | null>(null)

// Generated in the browser: rendering it server-side would only inflate the HTML with a
// data URL that changes with the origin.
onMounted(async () => {
  qrDataUrl.value = await QRCode.toDataURL(`${requestUrl.origin}/app/${props.slug}`, {
    width: 256,
    margin: 1,
    color: { dark: '#3B463D', light: '#FFFFFF' }
  })
})
</script>
