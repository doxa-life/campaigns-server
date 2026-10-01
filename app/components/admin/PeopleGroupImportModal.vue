<template>
  <UModal v-model:open="isOpen" title="Update people groups from CSV" fullscreen>
    <template #body>
      <div class="flex flex-col gap-4">
        <template v-if="step === 'map'">
          <UFileUpload
            v-model="file"
            accept=".csv,text/csv"
            variant="area"
            label="Drop a CSV file here or click to choose one"
            description="The first row must hold the column headers. Rows are matched to people groups by IMB PEID."
            icon="i-lucide-file-spreadsheet"
            :preview="false"
          />

          <UAlert v-if="parseError" color="error" variant="subtle" :title="parseError" />

          <template v-if="headers.length > 0">
            <div>
              <p class="text-sm text-muted mb-2">
                {{ rowCount }} {{ rowCount === 1 ? 'row' : 'rows' }} found. Choose which people group field each column fills;
                columns left on skip are ignored. A button beside a column offers the field its header names, or a comment when it names none.
                Blank cells leave the field as it is.
              </p>
              <UTable :data="columnRows" :columns="mappingColumns" class="border border-default rounded-md">
                <template #sample-cell="{ row }">
                  <span :title="row.original.sample">{{ row.original.sample }}</span>
                </template>
                <template #field-cell="{ row }">
                  <div class="flex items-center gap-2">
                    <USelectMenu
                      :model-value="mapping[row.original.header] ?? SKIP_COLUMN"
                      :items="targetOptions"
                      value-key="value"
                      size="sm"
                      class="w-64"
                      @update:model-value="v => setMapping(row.original.header, String(v))"
                    />
                    <UButton
                      v-if="canSuggest(row.original.header)"
                      size="xs"
                      variant="soft"
                      icon="i-lucide-arrow-left"
                      :label="targetLabels.get(suggestions[row.original.header]!)"
                      @click="setMapping(row.original.header, suggestions[row.original.header]!)"
                    />
                  </div>
                </template>
              </UTable>
            </div>

            <UAlert v-if="mappingError" color="warning" variant="subtle" :title="mappingError" />
          </template>
        </template>

        <template v-else-if="step === 'preview' && plan">
          <UAlert
            :color="plan.rows.length > 0 ? 'info' : 'warning'"
            variant="subtle"
            :title="`${plan.rows.length} ${plan.rows.length === 1 ? 'people group' : 'people groups'} will change`"
            :description="`${plan.total} rows: ${plan.matched} matched, ${plan.unchanged} already up to date, ${plan.errors.length} skipped.`"
          />

          <div v-if="fieldCountList.length > 0" class="flex flex-wrap gap-1">
            <UBadge
              v-for="entry in fieldCountList"
              :key="entry.label"
              :label="`${entry.label}: ${entry.count}`"
              color="neutral"
              variant="subtle"
            />
          </div>

          <AdminImportIssueList title="Skipped rows" :issues="plan.errors" color="error" />
          <AdminImportIssueList title="Check these" :issues="plan.warnings" color="warning" />

          <UTable v-if="plan.rows.length > 0" :data="plan.rows" :columns="previewColumns" class="border border-default rounded-md">
            <template #name-cell="{ row }">
              <div class="font-medium">{{ row.original.name }}</div>
              <div class="text-xs text-muted">PEID {{ row.original.peid }} · row {{ row.original.row }}</div>
            </template>
            <template #changes-cell="{ row }">
              <ul class="text-sm">
                <li v-for="change in row.original.changes" :key="change.field">
                  <span class="text-muted">{{ change.label }}:</span>
                  {{ change.from_display || '—' }} → <span class="font-medium">{{ change.to_display }}</span>
                </li>
              </ul>
              <div v-if="row.original.comment" class="mt-1 pl-2 border-l-2 border-default text-sm whitespace-normal">
                <div class="text-muted">New comment</div>
                <p v-for="(paragraph, i) in row.original.comment" :key="i">{{ paragraph }}</p>
              </div>
            </template>
          </UTable>
        </template>

        <template v-else-if="step === 'done' && result">
          <UAlert
            :color="result.failed.length === 0 ? 'success' : 'warning'"
            variant="subtle"
            :title="`${result.updated} ${result.updated === 1 ? 'people group' : 'people groups'} updated`"
            :description="result.failed.length > 0 ? `${result.failed.length} could not be updated.` : undefined"
          />
          <AdminImportIssueList title="Not updated" :issues="result.failed" color="error" />
          <AdminImportIssueList title="Skipped rows" :issues="result.errors" color="error" />
        </template>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <template v-if="step === 'map'">
          <UButton variant="outline" @click="close">Cancel</UButton>
          <UButton :disabled="!canPreview" :loading="working" icon="i-lucide-eye" @click="preview">
            Preview changes
          </UButton>
        </template>
        <template v-else-if="step === 'preview' && plan">
          <UButton variant="outline" @click="() => { step = 'map' }">Back</UButton>
          <UButton :disabled="plan.rows.length === 0" :loading="working" icon="i-lucide-upload" @click="apply">
            Update {{ plan.rows.length }} {{ plan.rows.length === 1 ? 'people group' : 'people groups' }}
          </UButton>
        </template>
        <template v-else-if="step === 'done'">
          <UButton variant="outline" @click="reset">Import another file</UButton>
          <UButton @click="close">Done</UButton>
        </template>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { parseCsv, parseCsvHeader } from '#shared/csv'
import {
  IMPORT_COMMENT_TARGET,
  IMPORT_NAME_CHECK_TARGET,
  IMPORT_PEID_TARGET,
  guessImportTarget,
  importableFields
} from '~/utils/people-group-import'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  imported: []
}>()

interface ImportIssue {
  row: number
  peid: string | null
  message: string
}

interface ImportRowPlan {
  row: number
  peid: string
  people_group_id: number
  name: string
  changes: { field: string; label: string; from_display: string; to_display: string }[]
  comment: string[] | null
}

interface ImportPlan {
  total: number
  matched: number
  unchanged: number
  rows: ImportRowPlan[]
  errors: ImportIssue[]
  warnings: ImportIssue[]
  field_counts: Record<string, number>
}

interface ImportResult {
  updated: number
  failed: ImportIssue[]
  errors: ImportIssue[]
}

interface ColumnRow {
  header: string
  sample: string
}

const toast = useToast()
const { t } = useI18n()

const isOpen = computed({
  get: () => props.open,
  set: (value) => emit('update:open', value)
})

const step = ref<'map' | 'preview' | 'done'>('map')
const file = ref<File | null>(null)
const headers = ref<string[]>([])
const samples = ref<Record<string, string>>({})
const rowCount = ref(0)
const mapping = ref<Record<string, string>>({})
const suggestions = ref<Record<string, string>>({})
const parseError = ref('')
const working = ref(false)
const plan = ref<ImportPlan | null>(null)
const result = ref<ImportResult | null>(null)

const mappingColumns: TableColumn<ColumnRow>[] = [
  { accessorKey: 'header', header: 'CSV column' },
  { accessorKey: 'sample', header: 'Example', meta: { class: { td: 'max-w-xs truncate' } } },
  { id: 'field', header: 'People group field' }
]

const previewColumns: TableColumn<ImportRowPlan>[] = [
  { id: 'name', header: 'People group' },
  { id: 'changes', header: 'Changes' }
]

// The select rejects an empty string as an option value, so skipping gets its own key.
const SKIP_COLUMN = '__skip__'

const fieldLabel = (field: { labelKey: string }) => t(field.labelKey)

const targetOptions = computed(() => [
  { label: 'Skip this column', value: SKIP_COLUMN },
  { label: 'IMB PEID (matches the row)', value: IMPORT_PEID_TARGET },
  { label: 'Name (check only)', value: IMPORT_NAME_CHECK_TARGET },
  { label: 'Add to a comment', value: IMPORT_COMMENT_TARGET },
  ...importableFields
    .map(f => ({ label: fieldLabel(f), value: f.key }))
    .sort((a, b) => a.label.localeCompare(b.label))
])

const targetLabels = computed(() => new Map(targetOptions.value.map(o => [o.value, o.label])))

const columnRows = computed<ColumnRow[]>(() =>
  headers.value.map(header => ({ header, sample: samples.value[header] ?? '' }))
)

const mappingError = computed(() => {
  const used = Object.values(mapping.value)
  if (!used.includes(IMPORT_PEID_TARGET)) return 'Map one column to the IMB PEID.'
  const duplicate = used.find((key, i) => key !== IMPORT_COMMENT_TARGET && used.indexOf(key) !== i)
  if (duplicate) return `Two columns are mapped to ${targetLabels.value.get(duplicate) ?? duplicate}.`
  if (!used.some(key => key !== IMPORT_PEID_TARGET && key !== IMPORT_NAME_CHECK_TARGET)) return 'Map at least one column to a field or a comment.'
  return ''
})

const canPreview = computed(() => !!file.value && headers.value.length > 0 && !mappingError.value && !working.value)

const fieldCountList = computed(() =>
  Object.entries(plan.value?.field_counts ?? {})
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
)

watch(file, async (selected) => {
  headers.value = []
  samples.value = {}
  rowCount.value = 0
  mapping.value = {}
  suggestions.value = {}
  parseError.value = ''
  plan.value = null
  if (!selected) return

  try {
    const text = (await selected.text()).replace(/^﻿/, '')
    const parsedHeaders = parseCsvHeader(text).filter(h => h !== '')
    if (parsedHeaders.length === 0) {
      parseError.value = 'The file has no header row.'
      return
    }
    const rows = parseCsv(text)
    headers.value = parsedHeaders
    rowCount.value = rows.length
    const firstValues: Record<string, string> = {}
    for (const header of parsedHeaders) {
      firstValues[header] = rows.find(r => r[header])?.[header] ?? ''
    }
    samples.value = firstValues
    const guessed: Record<string, string> = {}
    for (const header of parsedHeaders) {
      guessed[header] = guessImportTarget(header, fieldLabel) ?? IMPORT_COMMENT_TARGET
    }
    suggestions.value = guessed
    // Only the PEID, which matches rows and writes nothing, is mapped without asking.
    const peidHeader = parsedHeaders.find(h => guessed[h] === IMPORT_PEID_TARGET)
    mapping.value = peidHeader ? { [peidHeader]: IMPORT_PEID_TARGET } : {}
  } catch {
    parseError.value = 'The file could not be read as text.'
  }
})

watch(() => props.open, (open) => {
  if (open) reset()
})

/** True when a column's suggested field is not yet set on it and no other column holds it. */
function canSuggest(header: string): boolean {
  const target = suggestions.value[header]
  if (!target || mapping.value[header] === target) return false
  return target === IMPORT_COMMENT_TARGET || !Object.values(mapping.value).includes(target)
}

function setMapping(header: string, target: string) {
  if (target && target !== SKIP_COLUMN) mapping.value = { ...mapping.value, [header]: target }
  else {
    const next = { ...mapping.value }
    delete next[header]
    mapping.value = next
  }
}

function close() {
  isOpen.value = false
}

function reset() {
  step.value = 'map'
  file.value = null
  headers.value = []
  samples.value = {}
  rowCount.value = 0
  mapping.value = {}
  suggestions.value = {}
  parseError.value = ''
  plan.value = null
  result.value = null
}

function requestBody(dryRun: boolean): FormData {
  const body = new FormData()
  body.append('file', file.value!)
  body.append('mapping', JSON.stringify(mapping.value))
  body.append('dry_run', String(dryRun))
  return body
}

async function preview() {
  if (!file.value || !canPreview.value) return
  working.value = true
  try {
    plan.value = await $fetch<ImportPlan>('/api/admin/people-groups/import', { method: 'POST', body: requestBody(true) })
    step.value = 'preview'
  } catch (err: any) {
    toast.add({ title: 'Preview failed', description: err.data?.statusMessage || 'Could not read the file', color: 'error' })
  } finally {
    working.value = false
  }
}

async function apply() {
  if (!file.value || !plan.value) return
  working.value = true
  try {
    result.value = await $fetch<ImportResult>('/api/admin/people-groups/import', { method: 'POST', body: requestBody(false) })
    step.value = 'done'
    emit('imported')
  } catch (err: any) {
    toast.add({ title: 'Import failed', description: err.data?.statusMessage || 'Could not import the file', color: 'error' })
  } finally {
    working.value = false
  }
}
</script>
