<template>
  <UFieldGroup v-if="field?.type === 'boolean'">
    <UButton
      type="button"
      :variant="model === 'true' ? 'solid' : 'outline'"
      :color="model === 'true' ? 'primary' : 'neutral'"
      :label="$t('common.yes')"
      @click="toggleBoolean('true')"
    />
    <UButton
      type="button"
      :variant="model === 'false' ? 'solid' : 'outline'"
      :color="model === 'false' ? 'primary' : 'neutral'"
      :label="$t('common.no')"
      @click="toggleBoolean('false')"
    />
  </UFieldGroup>
  <USelectMenu
    v-else-if="selectOptions"
    :model-value="(model as string | undefined)"
    :items="selectOptions"
    value-key="value"
    :placeholder="placeholder || label"
    :search-input="{ placeholder: label }"
    :virtualize="selectOptions.length > 50"
    class="w-full"
    @update:model-value="model = $event"
  />
  <UInput
    v-else-if="field?.type === 'number'"
    type="number"
    step="any"
    :model-value="(model as number | undefined)"
    :placeholder="placeholder || label"
    class="w-full"
    @update:model-value="model = $event"
  />
  <UTextarea
    v-else-if="field?.type === 'textarea'"
    :model-value="(model as string | undefined)"
    :rows="3"
    :placeholder="placeholder || label"
    class="w-full"
    @update:model-value="model = $event"
  />
  <UInput
    v-else
    :model-value="(model as string | undefined)"
    :placeholder="placeholder || label"
    class="w-full"
    @update:model-value="model = $event"
  />
</template>

<script setup lang="ts">
import countriesLib from 'i18n-iso-countries'
import countriesEn from 'i18n-iso-countries/langs/en.json'
import { getField } from '~/utils/people-group-fields'

countriesLib.registerLocale(countriesEn)

// Renders the right input for a people-group field key, driven by the field
// registry (select options, countries source, number/textarea types).
const props = defineProps<{
  fieldKey: string
  placeholder?: string
}>()

const model = defineModel<string | number | null>({ default: null })

const { t } = useI18n()

const field = computed(() => getField(props.fieldKey))
const label = computed(() => (field.value ? t(field.value.labelKey) : props.fieldKey))

// Booleans render as a Yes/No toggle pair; clicking the active side clears it
// back to "no change". The API coerces the 'true'/'false' strings to booleans.
function toggleBoolean(value: string) {
  model.value = model.value === value ? null : value
}

const selectOptions = computed<{ value: string; label: string }[] | null>(() => {
  const def = field.value
  if (!def) return null
  if (def.optionsSource === 'countries') {
    // people_groups.country_code stores ISO alpha-3 (from IMB's ISOalpha3).
    return Object.entries(countriesLib.getNames('en', { select: 'official' }))
      .map(([alpha2, name]) => ({ value: countriesLib.alpha2ToAlpha3(alpha2) || alpha2, label: name as string }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }
  if (def.type === 'select' && def.options) {
    return def.options.map((opt) => ({
      value: opt.value,
      label: opt.label || (opt.labelKey ? t(opt.labelKey) : opt.value)
    }))
  }
  return null
})
</script>
