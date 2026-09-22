const MARKETING_SITE_URL = 'https://doxa.life'

/**
 * Builds a link to the marketing site in the locale the visitor is reading.
 * That site prefixes every locale but English, the same scheme this one uses.
 */
export function useMarketingUrl() {
  const { locale } = useI18n()

  return (path = '/') => {
    const prefix = locale.value === 'en' ? '' : `/${locale.value}`
    return `${MARKETING_SITE_URL}${prefix}${path.startsWith('/') ? path : `/${path}`}`
  }
}
