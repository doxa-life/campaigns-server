<template>
  <UModal v-model:open="isOpen" title="Import churches from CSV" :ui="{ content: 'sm:max-w-3xl' }">
    <template #body>
      <div class="flex flex-col gap-4">
        <template v-if="!result">
          <UFileUpload
            v-model="file"
            accept=".csv,text/csv"
            variant="area"
            label="Drop a CSV file here or click to choose one"
            description="The first row must hold the column headers"
            icon="i-lucide-file-spreadsheet"
            :preview="false"
          />

          <UAlert v-if="parseError" color="error" variant="subtle" :title="parseError" />

          <template v-if="headers.length > 0">
            <div>
              <p class="text-sm text-muted mb-2">
                {{ rowCount }} {{ rowCount === 1 ? 'row' : 'rows' }} found. Choose which church field each column fills.
              </p>
              <UTable :data="columnRows" :columns="columns" class="mapping-table">
                <template #field-cell="{ row }">
                  <USelect
                    :model-value="mapping[row.original.header] ?? SKIP_COLUMN"
                    :items="fieldOptions"
                    value-key="value"
                    size="sm"
                    class="w-56"
                    @update:model-value="v => setMapping(row.original.header, String(v))"
                  />
                </template>
              </UTable>
            </div>

            <UFormField
              label="Country for rows without one"
              hint="Optional"
              :description="countryMapped ? 'Fills in rows whose country cell is blank.' : 'Churches without a country are imported but their location is not looked up.'"
            >
              <USelectMenu
                v-model="defaultCountry"
                :items="countryOptions"
                value-key="value"
                placeholder="No default country"
                clear
                virtualize
                class="w-full"
              />
            </UFormField>

            <UAlert v-if="mappingError" color="warning" variant="subtle" :title="mappingError" />
          </template>

          <div class="flex justify-end gap-2 mt-2">
            <UButton variant="outline" @click="close">Cancel</UButton>
            <UButton :disabled="!canImport" :loading="importing" icon="i-lucide-upload" @click="runImport">
              Import {{ rowCount || '' }} {{ rowCount === 1 ? 'church' : 'churches' }}
            </UButton>
          </div>
        </template>

        <template v-else>
          <UAlert
            :color="result.imported > 0 ? 'success' : 'warning'"
            variant="subtle"
            :title="`${result.imported} of ${result.total} ${result.total === 1 ? 'row' : 'rows'} imported`"
            :description="queuedMessage"
          />
          <div v-if="result.errors.length > 0">
            <p class="text-sm font-medium mb-1">Skipped rows</p>
            <ul class="text-sm text-muted max-h-48 overflow-y-auto list-disc list-inside">
              <li v-for="err in result.errors" :key="err.row">Row {{ err.row }}: {{ err.message }}</li>
            </ul>
            <p v-if="result.skipped > result.errors.length" class="text-xs text-muted mt-1">
              And {{ result.skipped - result.errors.length }} more.
            </p>
          </div>
          <div class="flex justify-end gap-2 mt-2">
            <UButton variant="outline" @click="reset">Import another file</UButton>
            <UButton @click="close">Done</UButton>
          </div>
        </template>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { parseCsv, parseCsvHeader } from '#shared/csv'
import { CHURCH_FIELDS, guessChurchField } from '#shared/churches'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  imported: [country: string | null]
}>()

interface ImportResult {
  total: number
  imported: number
  queued: number
  skipped: number
  errors: { row: number; message: string }[]
}

interface ColumnRow {
  header: string
  sample: string
}

const toast = useToast()
const { countryOptions } = useLocalizedOptions()

const isOpen = computed({
  get: () => props.open,
  set: (value) => emit('update:open', value)
})

const file = ref<File | null>(null)
const headers = ref<string[]>([])
const samples = ref<Record<string, string>>({})
const rowCount = ref(0)
const mapping = ref<Record<string, string>>({})
const defaultCountry = ref<string | undefined>(undefined)
const parseError = ref('')
const importing = ref(false)
const result = ref<ImportResult | null>(null)

const columns: TableColumn<ColumnRow>[] = [
  { accessorKey: 'header', header: 'CSV column' },
  { accessorKey: 'sample', header: 'Example' },
  { id: 'field', header: 'Church field' }
]

// The select rejects an empty string as an option value, so skipping gets its own key.
const SKIP_COLUMN = '__skip__'

const fieldOptions = [
  { label: 'Skip this column', value: SKIP_COLUMN },
  ...CHURCH_FIELDS.map(f => ({ label: f.label, value: f.key }))
]

const columnRows = computed<ColumnRow[]>(() =>
  headers.value.map(header => ({ header, sample: samples.value[header] ?? '' }))
)

const countryMapped = computed(() => Object.values(mapping.value).includes('country'))

const mappingError = computed(() => {
  const used = Object.values(mapping.value).filter(Boolean)
  if (!used.includes('name')) return 'Map one column to the church name.'
  const duplicate = used.find((key, i) => used.indexOf(key) !== i)
  if (duplicate) {
    const label = CHURCH_FIELDS.find(f => f.key === duplicate)?.label ?? duplicate
    return `Two columns are mapped to ${label}.`
  }
  return ''
})

const canImport = computed(() => !!file.value && headers.value.length > 0 && !mappingError.value && !importing.value)

const queuedMessage = computed(() => {
  const r = result.value
  if (!r || r.imported === 0) return undefined
  if (r.queued === 0) return 'No locations to look up: the imported rows have no town and country.'
  if (r.queued === r.imported) return 'Locations are being looked up in the background.'
  return `${r.queued} of the imported churches have a town and country; their locations are being looked up in the background.`
})

watch(file, async (selected) => {
  headers.value = []
  samples.value = {}
  rowCount.value = 0
  mapping.value = {}
  parseError.value = ''
  if (!selected) return

  try {
    const text = await selected.text()
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
    const taken = new Set<string>()
    for (const header of parsedHeaders) {
      const field = guessChurchField(header)
      if (field && !taken.has(field)) {
        guessed[header] = field
        taken.add(field)
      }
    }
    mapping.value = guessed
  } catch {
    parseError.value = 'The file could not be read as text.'
  }
})

watch(() => props.open, (open) => {
  if (open) reset()
})

function setMapping(header: string, field: string) {
  if (field && field !== SKIP_COLUMN) mapping.value = { ...mapping.value, [header]: field }
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
  file.value = null
  headers.value = []
  samples.value = {}
  rowCount.value = 0
  mapping.value = {}
  defaultCountry.value = undefined
  parseError.value = ''
  result.value = null
}

async function runImport() {
  if (!file.value || !canImport.value) return
  importing.value = true
  try {
    const body = new FormData()
    body.append('file', file.value)
    body.append('mapping', JSON.stringify(mapping.value))
    if (defaultCountry.value) body.append('default_country', defaultCountry.value)

    result.value = await $fetch<ImportResult>('/api/admin/churches/import', { method: 'POST', body })
    emit('imported', defaultCountry.value ?? null)
  } catch (err: any) {
    toast.add({ title: 'Import failed', description: err.data?.statusMessage || 'Could not import the file', color: 'error' })
  } finally {
    importing.value = false
  }
}
</script>

<style scoped>
.mapping-table {
  max-height: 20rem;
  overflow-y: auto;
  border: 1px solid var(--ui-border);
  border-radius: 6px;
}
</style>
