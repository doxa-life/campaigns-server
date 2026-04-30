<template>
  <div class="language-switcher">
    <label for="language-select" class="sr-only">Select Language</label>
    <select
      id="language-select"
      v-model="selectedLanguage"
      @change="onLanguageChange"
      class="language-select"
    >
      <option v-for="lang in availableLocales" :key="lang.code" :value="lang.code">
        {{ getLanguageFlag(lang.code) }} {{ lang.name }}
      </option>
    </select>
  </div>
</template>

<script setup lang="ts">
import { getLanguageFlag, ENABLED_LANGUAGE_CODES } from '~/utils/languages'

const { locale, locales } = useI18n()
const switchLocalePath = useSwitchLocalePath()
const router = useRouter()
const { trackEvent } = useTracking()

const selectedLanguage = ref(locale.value)
const availableLocales = computed(() =>
  locales.value.filter(l => ENABLED_LANGUAGE_CODES.includes(l.code))
)

// Watch for locale changes to update selected language
watch(locale, (newLang) => {
  selectedLanguage.value = newLang
})

async function onLanguageChange() {
  const fromLang = locale.value
  const toLang = selectedLanguage.value
  trackEvent('language_switched', {
    metadata: {
      from_lang: fromLang,
      to_lang: toLang
    }
  })
  const newPath = switchLocalePath(selectedLanguage.value)
  await router.push(newPath)
}
</script>

<style scoped>
.language-switcher {
  display: inline-block;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

.language-select {
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  background: var(--ui-bg);
  color: var(--ui-text);
  font-size: 0.875rem;
  cursor: pointer;
  transition: border-color 0.2s, background-color 0.2s;
  min-width: 140px;
}

.language-select:hover {
  border-color: var(--ui-border-accented);
  background: var(--ui-bg-elevated);
}

.language-select:focus {
  outline: none;
  border-color: var(--ui-ring);
}

.language-select option {
  background: var(--ui-bg);
  color: var(--ui-text);
}
</style>
