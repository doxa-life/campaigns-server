import { computed } from 'vue'
import { useI18n } from '#imports'
import countries from 'i18n-iso-countries'

// Register locales for countries library
import countriesEn from 'i18n-iso-countries/langs/en.json'
import countriesEs from 'i18n-iso-countries/langs/es.json'
import countriesFr from 'i18n-iso-countries/langs/fr.json'
import countriesPt from 'i18n-iso-countries/langs/pt.json'
import countriesDe from 'i18n-iso-countries/langs/de.json'
import countriesIt from 'i18n-iso-countries/langs/it.json'
import countriesZh from 'i18n-iso-countries/langs/zh.json'
import countriesAr from 'i18n-iso-countries/langs/ar.json'
import countriesRu from 'i18n-iso-countries/langs/ru.json'
import countriesHi from 'i18n-iso-countries/langs/hi.json'

// Register all country locales
countries.registerLocale(countriesEn)
countries.registerLocale(countriesEs)
countries.registerLocale(countriesFr)
countries.registerLocale(countriesPt)
countries.registerLocale(countriesDe)
countries.registerLocale(countriesIt)
countries.registerLocale(countriesZh)
countries.registerLocale(countriesAr)
countries.registerLocale(countriesRu)
countries.registerLocale(countriesHi)

export interface LocalizedOption {
  value: string
  label: string
}

export function useLocalizedOptions() {
  const { locale } = useI18n()

  const getCountryName = (code: string): string => {
    if (!code) return ''
    const name = countries.getName(code, locale.value, { select: 'official' })
    return name || code
  }

  const countryOptions = computed<LocalizedOption[]>(() => {
    const countryObj = countries.getNames(locale.value, { select: 'official' })
    return Object.entries(countryObj)
      .map(([code, name]) => ({
        value: code,
        label: name as string
      }))
      .sort((a, b) => a.label.localeCompare(b.label, locale.value))
  })

  return {
    getCountryName,
    countryOptions
  }
}
