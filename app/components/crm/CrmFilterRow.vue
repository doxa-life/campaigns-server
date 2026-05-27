<template>
  <div class="filter-row">
    <USelect
      :model-value="row.field"
      :items="fieldOptions"
      value-key="value"
      class="field-select"
      @update:model-value="onFieldChange($event as string)"
    />

    <USelect
      v-if="operatorOptions.length > 1"
      :model-value="row.op"
      :items="operatorOptions"
      value-key="value"
      class="op-select"
      @update:model-value="onOpChange($event as Operator)"
    />
    <span v-else class="op-static">{{ operatorOptions[0]?.label }}</span>

    <!-- Value input dispatched by field type + operator -->
    <template v-if="!currentOpChoice?.noValue">
      <template v-if="field.type === 'text'">
        <UInput
          :model-value="row.value as string"
          type="text"
          class="value-input"
          placeholder="Value"
          @update:model-value="setValue($event)"
        />
      </template>

      <template v-else-if="field.type === 'number'">
        <template v-if="row.op === 'between'">
          <UInput
            :model-value="(row.value as number[])?.[0]"
            type="number"
            class="value-input-narrow"
            placeholder="from"
            @update:model-value="setRange(0, Number($event))"
          />
          <span class="value-sep">–</span>
          <UInput
            :model-value="(row.value as number[])?.[1]"
            type="number"
            class="value-input-narrow"
            placeholder="to"
            @update:model-value="setRange(1, Number($event))"
          />
        </template>
        <UInput
          v-else
          :model-value="row.value as number"
          type="number"
          class="value-input"
          placeholder="Value"
          @update:model-value="setValue(Number($event))"
        />
      </template>

      <template v-else-if="field.type === 'date'">
        <template v-if="row.op === 'between'">
          <USelect
            :model-value="datePreset"
            :items="DATE_PRESETS"
            value-key="value"
            class="op-select"
            @update:model-value="applyDatePreset($event as string)"
          />
          <UInput
            :model-value="(row.value as string[])?.[0]"
            type="date"
            class="value-input-narrow"
            @update:model-value="setRange(0, String($event))"
          />
          <span class="value-sep">–</span>
          <UInput
            :model-value="(row.value as string[])?.[1]"
            type="date"
            class="value-input-narrow"
            @update:model-value="setRange(1, String($event))"
          />
        </template>
        <UInput
          v-else
          :model-value="row.value as string"
          type="date"
          class="value-input"
          @update:model-value="setValue(String($event))"
        />
      </template>

      <template v-else-if="field.type === 'enum'">
        <USelectMenu
          :model-value="row.value"
          :items="(field.values || []) as any"
          value-key="value"
          class="value-input"
          placeholder="Select..."
          @update:model-value="setValue($event)"
        />
      </template>

      <template v-else-if="field.type === 'enum-multi'">
        <USelectMenu
          :model-value="(row.value as unknown[]) || []"
          :items="(field.values || []) as any"
          value-key="value"
          multiple
          class="value-input"
          placeholder="Select..."
          @update:model-value="setValue($event)"
        />
      </template>

      <template v-else-if="field.type === 'foreign-key'">
        <USelectMenu
          :model-value="row.value"
          :items="loadedFkValues as any"
          value-key="value"
          virtualize
          class="value-input"
          placeholder="Select..."
          @update:model-value="setValue($event)"
        />
      </template>
    </template>

    <UButton
      icon="i-lucide-x"
      size="xs"
      variant="ghost"
      color="neutral"
      @click="$emit('remove')"
    />
  </div>
</template>

<script setup lang="ts">
import type { FilterRow, Operator } from '#shared/crm/filter-types'
import {
  operatorsForField,
  type ClientFieldDef,
  type ClientManifest,
  type OperatorChoice,
} from '~/utils/crm/filter-manifest'

const props = defineProps<{
  row: FilterRow
  manifest: ClientManifest
}>()

const emit = defineEmits<{
  'update:row': [row: FilterRow]
  remove: []
}>()

const fieldOptions = computed(() =>
  props.manifest.map(f => ({ label: f.label, value: f.key }))
)

const field = computed<ClientFieldDef>(() => {
  return props.manifest.find(f => f.key === props.row.field) ?? props.manifest[0]!
})

const operatorOptions = computed<OperatorChoice[]>(() => operatorsForField(field.value))

const currentOpChoice = computed<OperatorChoice | undefined>(() =>
  operatorOptions.value.find(o => o.value === props.row.op)
)

// Lazy-load foreign-key values the first time the row needs them.
const loadedFkValues = ref<{ label: string; value: unknown }[]>([])
watchEffect(async () => {
  if (field.value.type !== 'foreign-key') return
  if (field.value.values) {
    loadedFkValues.value = field.value.values
  } else if (field.value.valuesLoader) {
    loadedFkValues.value = await field.value.valuesLoader()
  }
})

function emitUpdate(patch: Partial<FilterRow>) {
  emit('update:row', { ...props.row, ...patch })
}

function setValue(value: unknown) {
  emitUpdate({ value })
}

function setRange(index: 0 | 1, value: unknown) {
  const existing = Array.isArray(props.row.value) ? [...(props.row.value as unknown[])] : [null, null]
  existing[index] = value
  emitUpdate({ value: existing })
}

function onFieldChange(newKey: string) {
  const newField = props.manifest.find(f => f.key === newKey)
  if (!newField) return
  const ops = operatorsForField(newField)
  const defaultOp = ops[0]!.value
  emit('update:row', { field: newKey, op: defaultOp, value: undefined })
}

function onOpChange(newOp: Operator) {
  emitUpdate({ op: newOp, value: undefined })
}

const DATE_PRESETS = [
  { value: 'custom', label: 'Custom range' },
  { value: 'today', label: 'Today' },
  { value: 'last7', label: 'Last 7 days' },
  { value: 'last30', label: 'Last 30 days' },
  { value: 'thisYear', label: 'This year' },
]

const datePreset = ref<string>('custom')

function applyDatePreset(preset: string) {
  datePreset.value = preset
  if (preset === 'custom') return
  const today = new Date()
  const yyyy = (d: Date) => d.toISOString().slice(0, 10)
  let from = today
  const to = new Date(today)
  to.setDate(to.getDate() + 1) // exclusive upper bound
  if (preset === 'today') {
    from = today
  } else if (preset === 'last7') {
    from = new Date(today); from.setDate(from.getDate() - 7)
  } else if (preset === 'last30') {
    from = new Date(today); from.setDate(from.getDate() - 30)
  } else if (preset === 'thisYear') {
    from = new Date(today.getFullYear(), 0, 1)
  }
  emitUpdate({ value: [yyyy(from), yyyy(to)] })
}
</script>

<style scoped>
.filter-row {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-wrap: wrap;
}
.field-select { min-width: 10rem; }
.op-select { min-width: 7rem; }
.op-static {
  font-size: 0.875rem;
  color: var(--ui-text-muted);
  padding: 0 0.25rem;
}
.value-input { flex: 1; min-width: 8rem; }
.value-input-narrow { width: 8rem; }
.value-sep { color: var(--ui-text-muted); }
</style>
