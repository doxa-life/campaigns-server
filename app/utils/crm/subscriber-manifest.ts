import { LANGUAGES } from '~/utils/languages'
import { getFieldOptions } from '~/utils/subscriber-fields'
import type { ClientManifest } from './filter-manifest'

export function useSubscriberFilterManifest() {
  const { countryOptions } = useLocalizedOptions()

  const sourceOptions = getFieldOptions('sources').map(o => ({
    label: o.label,
    value: o.key,
  }))

  const languageOptions = LANGUAGES.map(l => ({ label: l.name, value: l.code }))

  const manifest = computed<ClientManifest>(() => [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'role', label: 'Role', type: 'text' },
    {
      key: 'preferred_language',
      label: 'Language',
      type: 'enum',
      values: languageOptions,
    },
    {
      key: 'country',
      label: 'Country',
      type: 'enum',
      values: countryOptions.value.map(o => ({ label: o.label, value: o.value })),
    },
    {
      key: 'sources',
      label: 'Sources',
      type: 'enum-multi',
      values: sourceOptions,
    },
    { key: 'created_at', label: 'Created', type: 'date' },
    { key: 'email_verified', label: 'Email Verified', type: 'boolean' },
    { key: 'doxa_general_consent', label: 'Doxa General Consent', type: 'boolean' },
    {
      key: 'subscribed_to_people_group',
      label: 'Subscribed to People Group',
      type: 'foreign-key',
      valuesLoader: async () => {
        const res = await $fetch<{ peopleGroups: { id: number; name: string }[] }>(
          '/api/admin/people-groups'
        )
        return res.peopleGroups.map(pg => ({ label: pg.name, value: pg.id }))
      },
    },
  ])

  return manifest
}
