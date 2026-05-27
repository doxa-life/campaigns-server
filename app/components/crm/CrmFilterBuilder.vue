<template>
  <div class="filter-builder">
    <div v-if="modelValue.rows.length === 0" class="filter-empty">
      <UButton
        size="xs"
        variant="outline"
        icon="i-lucide-plus"
        @click="addRow"
      >
        Add filter
      </UButton>
    </div>

    <template v-else>
      <div v-for="(row, idx) in modelValue.rows" :key="idx" class="filter-row-wrapper">
        <span v-if="idx > 0" class="filter-connector">AND</span>
        <CrmFilterRow
          :row="row"
          :manifest="manifest"
          @update:row="updateRow(idx, $event)"
          @remove="removeRow(idx)"
        />
      </div>

      <div class="filter-actions">
        <UButton
          size="xs"
          variant="outline"
          icon="i-lucide-plus"
          @click="addRow"
        >
          Add filter
        </UButton>
        <UButton
          size="xs"
          variant="ghost"
          color="neutral"
          @click="clearAll"
        >
          Clear all
        </UButton>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { FilterRow, FilterState } from '#shared/crm/filter-types'
import { operatorsForField, type ClientManifest } from '~/utils/crm/filter-manifest'
import CrmFilterRow from './CrmFilterRow.vue'

const props = defineProps<{
  modelValue: FilterState
  manifest: ClientManifest
}>()

const emit = defineEmits<{
  'update:modelValue': [state: FilterState]
}>()

function addRow() {
  const first = props.manifest[0]
  if (!first) return
  const op = operatorsForField(first)[0]!.value
  const newRow: FilterRow = { field: first.key, op, value: undefined }
  emit('update:modelValue', { v: 1, rows: [...props.modelValue.rows, newRow] })
}

function updateRow(index: number, row: FilterRow) {
  const rows = [...props.modelValue.rows]
  rows[index] = row
  emit('update:modelValue', { v: 1, rows })
}

function removeRow(index: number) {
  const rows = props.modelValue.rows.filter((_, i) => i !== index)
  emit('update:modelValue', { v: 1, rows })
}

function clearAll() {
  emit('update:modelValue', { v: 1, rows: [] })
}
</script>

<style scoped>
.filter-builder {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.filter-row-wrapper {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.filter-connector {
  font-size: 0.625rem;
  font-weight: 600;
  color: var(--ui-text-muted);
  letter-spacing: 0.05em;
}
.filter-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
.filter-empty {
  display: flex;
}
</style>
