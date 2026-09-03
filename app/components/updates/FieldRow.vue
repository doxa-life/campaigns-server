<template>
  <div class="field-row">
    <div class="field-label">{{ label || registryLabel }}</div>
    <div class="field-inputs" :class="{ 'with-current': showCurrent }">
      <div v-if="showCurrent" class="current-value">
        <span class="value-tag">{{ currentLabel || $t('updates.currentValue') }}</span>
        <slot name="current">
          <span>{{ currentDisplay || '—' }}</span>
        </slot>
      </div>
      <div>
        <span v-if="showCurrent" class="value-tag">{{ $t('updates.suggestedValue') }}</span>
        <slot>
          <UpdatesSuggestFieldInput v-model="model" :field-key="fieldKey" :exclude-options="excludeOptions" />
        </slot>
        <p v-if="hint" class="jp-hint">
          <UIcon name="i-lucide-info" class="shrink-0" />
          {{ hint }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getField } from '~/utils/people-group-fields'

// One suggestible field on the /updates form: label, optional current-value
// column, and the suggested-value input (overridable via the default slot).
const props = defineProps<{
  fieldKey: string
  label?: string
  showCurrent?: boolean
  // Tag over the left column; defaults to "Current".
  currentLabel?: string
  currentDisplay?: string
  hint?: string
  // Passed through to the suggested-value select input.
  excludeOptions?: string[]
}>()

const model = defineModel<string | number | null>({ default: null })

const { t } = useI18n()

const registryLabel = computed(() => {
  const field = getField(props.fieldKey)
  return field ? t(field.labelKey) : props.fieldKey
})
</script>

<style scoped>
.field-row {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}
.field-label {
  font-size: 0.875rem;
  font-weight: 500;
}
.field-inputs.with-current {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  align-items: start;
}
@media (max-width: 640px) {
  .field-inputs.with-current {
    grid-template-columns: 1fr;
  }
}
.current-value {
  font-size: 0.875rem;
  color: var(--ui-text-muted);
  padding: 0.375rem 0;
  overflow-wrap: anywhere;
}
.value-tag {
  display: block;
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ui-text-muted);
  margin-bottom: 0.125rem;
}
.jp-hint {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin: 0.375rem 0 0;
  font-size: 0.8125rem;
  color: var(--ui-info);
}
</style>
