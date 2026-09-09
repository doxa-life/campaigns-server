import { isOptOutReasonKey } from '~~/config/opt-out-reasons'

/**
 * Resolve a stored opt-out reason key to the wording for the current locale.
 * Only keys are ever stored, so an unrecognised value is shown as-is rather than
 * hidden — that way a key left behind by an older release stays visible in the CRM.
 */
export function useOptOutReasonLabel() {
  const { t } = useI18n()

  function optOutReasonLabel(key: string | null | undefined): string {
    if (!key) return ''
    if (!isOptOutReasonKey(key)) return key
    return t(`campaign.optOutReason.reason.${key}`)
  }

  return { optOutReasonLabel }
}
