<template>
  <div class="prayer-fuel-order-page">
    <div class="page-header">
      <div>
        <h1>Prayer Fuel Order</h1>
        <p class="subtitle">Configure the order of prayer fuel content. Libraries within a row play sequentially.</p>
      </div>
    </div>

    <div v-if="loading" class="loading">Loading configuration...</div>

    <div v-else-if="error" class="error">{{ error }}</div>

    <div v-else class="config-container">
      <!-- Global Start Date Section -->
      <div class="config-section full-width">
        <h3>Global Start Date</h3>
        <p class="section-description">
          This date determines when Day 1 begins for all people groups. Library content will be shown based on how many days have passed since this date.
        </p>

        <div class="start-date-section">
          <UFormField label="Start Date" required>
            <UInput
              type="date"
              v-model="globalStartDate"
            />
          </UFormField>

          <div v-if="globalStartDate" class="date-info">
            <p><strong>Day 1:</strong> {{ formatDisplayDate(globalStartDate) }}</p>
            <p><strong>Current Day:</strong> Day {{ currentDay }}</p>
          </div>
        </div>
      </div>

      <!-- Available Libraries Section -->
      <div class="config-section full-width">
        <h3>Available Libraries</h3>
        <p class="section-description">Drag libraries into rows below, or use the dropdown in each row to add them</p>

        <div v-if="allLibraries.length === 0" class="empty-message">
          <p>No libraries found. Create libraries first.</p>
        </div>

        <div v-else class="available-libraries">
          <div
            v-for="library in allLibraries"
            :key="library.id"
            class="library-chip"
            :class="{
              'dragging': dragState?.source === 'available' && dragState?.libraryId === library.id,
              'people-group-chip': library.type === 'people_group'
            }"
            draggable="true"
            @dragstart="dragStartFromAvailable(library.id)"
            @dragend="dragEnd"
          >
            <UIcon v-if="library.type === 'people_group'" name="i-lucide-users" class="library-type-icon" />
            <span class="library-chip-name">{{ library.name }}</span>
            <span class="library-chip-days">{{ getLibraryDaysLabel(library) }}</span>
          </div>
        </div>
      </div>

      <!-- Library Rows Section -->
      <div class="config-section full-width">
        <div class="section-header">
          <div>
            <h3>Library Rows</h3>
            <p class="section-description">
              Each row runs in parallel. Libraries within a row play sequentially (when one finishes, the next starts).
            </p>
          </div>
          <UButton @click="addRow" size="sm">
            + Add Row
          </UButton>
        </div>

        <div v-if="rows.length === 0" class="empty-message">
          <p>No rows configured. Add a row to get started.</p>
        </div>

        <div v-else class="rows-container">
          <div
            v-for="(row, rowIndex) in rows"
            :key="rowIndex"
            class="row-card"
          >
            <div class="row-header">
              <span class="row-label">Row {{ rowIndex + 1 }}</span>
              <span class="row-total-days">{{ getRowTotalDays(rowIndex) }} total days</span>
              <div class="row-actions">
                <UButton
                  @click="moveRowUp(rowIndex)"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-chevron-up"
                  :disabled="rowIndex === 0"
                  title="Move up"
                />
                <UButton
                  @click="moveRowDown(rowIndex)"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-chevron-down"
                  :disabled="rowIndex === rows.length - 1"
                  title="Move down"
                />
                <UButton
                  @click="removeRow(rowIndex)"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :disabled="rows.length === 1 && row.libraries.length === 0"
                >
                  Remove Row
                </UButton>
              </div>
            </div>

            <div
              class="row-content"
              @dragover.prevent="dragState?.source === 'available' && onDragOverRow($event, rowIndex)"
              @dragleave="onDragLeaveRow"
              @drop="dragState?.source === 'available' && dropFromAvailable(rowIndex)"
              :class="{ 'drop-target': dragState?.source === 'available' && dragOverRow === rowIndex }"
            >
              <div
                v-if="row.libraries.length === 0"
                class="row-empty"
                :class="{ 'drop-highlight': dragState?.source === 'available' }"
              >
                <p v-if="dragState?.source === 'available'">Drop library here</p>
                <p v-else>No libraries in this row. Drag a library here or use the dropdown below.</p>
              </div>

              <div v-else class="row-libraries">
                <div
                  v-for="(libConfig, libIndex) in row.libraries"
                  :key="`${rowIndex}-${libIndex}`"
                  class="row-library-card"
                  :class="{
                    'drag-over': dragOverTarget?.rowIndex === rowIndex && dragOverTarget?.libIndex === libIndex,
                    'dragging': dragState?.source === 'row' && dragState?.rowIndex === rowIndex && dragState?.libIndex === libIndex,
                    'people-group-card': getLibraryType(libConfig.libraryId) === 'people_group'
                  }"
                  draggable="true"
                  @dragstart="dragStart(rowIndex, libIndex)"
                  @dragend="dragEnd"
                  @dragover.prevent="onDragOver($event, rowIndex, libIndex)"
                  @dragleave="onDragLeave"
                  @drop="drop(rowIndex, libIndex)"
                >
                  <div class="drag-handle">
                    <span class="order-number">{{ libIndex + 1 }}</span>
                    ⋮⋮
                  </div>
                  <div class="library-info">
                    <div class="library-name-row">
                      <UIcon v-if="getLibraryType(libConfig.libraryId) === 'people_group'" name="i-lucide-users" class="library-type-icon" />
                      <strong>{{ getLibraryName(libConfig.libraryId) }}</strong>
                    </div>
                    <span class="library-stats">
                      {{ getLibraryDaysDisplay(libConfig.libraryId) }}
                      <template v-if="libIndex > 0 && !isLibraryContinuous(libConfig.libraryId)">
                        (starts Day {{ getLibraryStartDay(rowIndex, libIndex) }})
                      </template>
                    </span>
                  </div>
                  <UButton
                    @click="removeLibraryFromRow(rowIndex, libIndex)"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                  >
                    ×
                  </UButton>
                </div>
                <!-- Drop zone at the end (for reordering within row) -->
                <div
                  v-if="dragState?.source === 'row' && dragState?.rowIndex === rowIndex"
                  class="drop-zone-end"
                  @dragover.prevent="onDragOver($event, rowIndex, row.libraries.length)"
                  @dragleave="onDragLeave"
                  @drop="drop(rowIndex, row.libraries.length)"
                  :class="{ 'drag-over': dragOverTarget?.rowIndex === rowIndex && dragOverTarget?.libIndex === row.libraries.length }"
                >
                  Drop here
                </div>
              </div>

              <div class="add-library-section">
                <USelectMenu
                  :model-value="undefined"
                  @update:model-value="(lib: any) => lib && addLibraryToRow(rowIndex, lib as Library)"
                  :items="(getAvailableLibrariesForRow(rowIndex) as any[])"
                  placeholder="Add library..."
                  label-key="name"
                  :search-input="{ placeholder: 'Search libraries...' }"
                  class="library-select"
                  :ui="{ content: 'min-w-64' }"
                >
                  <template #item="{ item }">
                    <div class="select-item-content">
                      <UIcon v-if="(item as Library)?.type === 'people_group'" name="i-lucide-users" class="select-item-icon" />
                      <span>{{ (item as Library)?.name }}</span>
                    </div>
                    <span class="select-item-days">{{ getLibraryDaysLabel(item as Library) }}</span>
                  </template>
                </USelectMenu>
              </div>
            </div>
          </div>
        </div>

        <div class="save-section">
          <UButton
            @click="saveConfiguration"
            size="lg"
            :disabled="saving"
          >
            {{ saving ? 'Saving...' : 'Save Configuration' }}
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: 'auth'
})

interface Library {
  id: number
  name: string
  description: string
  type: 'static' | 'people_group'
  repeating?: boolean
  stats?: {
    totalDays: number
    languageStats: { [key: string]: number }
  }
}

interface LibraryConfig {
  libraryId: number
  order: number
}

interface RowConfig {
  rowIndex: number
  libraries: LibraryConfig[]
}

interface GlobalConfig {
  rows: RowConfig[]
  globalStartDate?: string
}

const allLibraries = ref<Library[]>([])
const rows = ref<RowConfig[]>([])
const globalStartDate = ref('')
const loading = ref(true)
const error = ref('')
const saving = ref(false)
const toast = useToast()

// Drag state - supports dragging from available libraries or within rows
const dragState = ref<{
  source: 'available' | 'row'
  libraryId?: number  // For available library drag
  rowIndex?: number   // For row library drag
  libIndex?: number   // For row library drag
} | null>(null)
const dragOverTarget = ref<{ rowIndex: number; libIndex: number } | null>(null)
const dragOverRow = ref<number | null>(null)

const currentDay = computed(() => {
  if (!globalStartDate.value) return 1

  // Parse as local date to avoid timezone issues (YYYY-MM-DD format)
  const [year, month, day] = globalStartDate.value.split('-').map(Number)
  const startDate = new Date(year!, month! - 1, day!)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  startDate.setHours(0, 0, 0, 0)

  const diffTime = today.getTime() - startDate.getTime()
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

  return Math.max(1, diffDays + 1)
})

async function loadLibraries() {
  try {
    // Include virtual People Group library for prayer fuel ordering
    const response = await $fetch<{ libraries: Library[] }>('/api/admin/libraries?includeVirtual=true')
    allLibraries.value = response.libraries
  } catch (err) {
    console.error('Failed to load libraries:', err)
    error.value = 'Failed to load libraries'
  }
}

async function loadConfiguration() {
  try {
    loading.value = true
    error.value = ''

    const response = await $fetch<{ config: GlobalConfig }>(
      '/api/admin/people-group-config/libraries'
    )

    rows.value = response.config.rows || []
    globalStartDate.value = response.config.globalStartDate || ''

    // Initialize with one empty row if none exist
    if (rows.value.length === 0) {
      rows.value = [{ rowIndex: 1, libraries: [] }]
    }
  } catch (err: any) {
    error.value = 'Failed to load configuration'
    console.error(err)
  } finally {
    loading.value = false
  }
}

function addRow() {
  const newRowIndex = rows.value.length + 1
  rows.value.push({ rowIndex: newRowIndex, libraries: [] })
}

function removeRow(rowIndex: number) {
  rows.value.splice(rowIndex, 1)
  // Re-index rows
  rows.value.forEach((row, idx) => {
    row.rowIndex = idx + 1
  })
}

function moveRowUp(rowIndex: number) {
  if (rowIndex === 0) return
  const items = [...rows.value]
  const temp = items[rowIndex - 1]!
  items[rowIndex - 1] = items[rowIndex]!
  items[rowIndex] = temp
  // Re-index rows
  items.forEach((row, idx) => {
    row.rowIndex = idx + 1
  })
  rows.value = items
}

function moveRowDown(rowIndex: number) {
  if (rowIndex >= rows.value.length - 1) return
  const items = [...rows.value]
  const temp = items[rowIndex + 1]!
  items[rowIndex + 1] = items[rowIndex]!
  items[rowIndex] = temp
  // Re-index rows
  items.forEach((row, idx) => {
    row.rowIndex = idx + 1
  })
  rows.value = items
}

function getAvailableLibrariesForRow(rowIndex: number): Library[] {
  // Return all libraries - duplicates allowed for repeating content
  return allLibraries.value
}

function addLibraryToRow(rowIndex: number, library: Library) {
  const row = rows.value[rowIndex]
  if (!row) return
  const newOrder = row.libraries.length + 1
  row.libraries.push({
    libraryId: library.id,
    order: newOrder
  })
}

function removeLibraryFromRow(rowIndex: number, libIndex: number) {
  const row = rows.value[rowIndex]
  if (!row) return
  row.libraries.splice(libIndex, 1)
  // Re-order
  row.libraries.forEach((lib, idx) => {
    lib.order = idx + 1
  })
}

function getLibraryName(libraryId: number): string {
  const library = allLibraries.value.find(lib => lib.id === libraryId)
  return library?.name || 'Unknown'
}

function getLibraryType(libraryId: number): string {
  const library = allLibraries.value.find(lib => lib.id === libraryId)
  return library?.type || 'static'
}

function getLibraryDays(libraryId: number): number {
  const library = allLibraries.value.find(lib => lib.id === libraryId)
  // People group libraries and repeating libraries have "infinite" days
  if (library?.type === 'people_group' || library?.repeating) {
    return 0 // Don't count towards row total
  }
  return Number(library?.stats?.totalDays) || 0
}

function getLibraryDaysLabel(library: Library): string {
  if (library.type === 'people_group' || library.repeating) {
    return 'Continuous'
  }
  return `${library.stats?.totalDays || 0} days`
}

function isLibraryContinuous(libraryId: number): boolean {
  const library = allLibraries.value.find(lib => lib.id === libraryId)
  return library?.type === 'people_group' || library?.repeating === true
}

function getLibraryDaysDisplay(libraryId: number): string {
  const library = allLibraries.value.find(lib => lib.id === libraryId)
  if (!library) return '0 days'
  return getLibraryDaysLabel(library)
}

function getRowTotalDays(rowIndex: number): number {
  const row = rows.value[rowIndex]
  if (!row) return 0
  return row.libraries.reduce((total, lib) => {
    return total + getLibraryDays(lib.libraryId)
  }, 0)
}

function getLibraryStartDay(rowIndex: number, libIndex: number): number {
  const row = rows.value[rowIndex]
  if (!row) return 1
  let startDay = 1
  for (let i = 0; i < libIndex; i++) {
    const lib = row.libraries[i]
    if (lib) startDay += getLibraryDays(lib.libraryId)
  }
  return startDay
}

function dragStartFromAvailable(libraryId: number) {
  dragState.value = { source: 'available', libraryId }
}

function dragStart(rowIndex: number, libIndex: number) {
  dragState.value = { source: 'row', rowIndex, libIndex }
}

function dragEnd() {
  dragState.value = null
  dragOverTarget.value = null
  dragOverRow.value = null
}

function onDragOver(event: DragEvent, rowIndex: number, libIndex: number) {
  event.preventDefault()
  dragOverTarget.value = { rowIndex, libIndex }
}

function onDragLeave() {
  dragOverTarget.value = null
}

function onDragOverRow(event: DragEvent, rowIndex: number) {
  event.preventDefault()
  dragOverRow.value = rowIndex
}

function onDragLeaveRow() {
  dragOverRow.value = null
}

function dropFromAvailable(targetRowIndex: number) {
  if (!dragState.value || dragState.value.source !== 'available' || !dragState.value.libraryId) {
    return
  }

  const libraryId = dragState.value.libraryId

  // Find the library and add it (duplicates allowed for repeating content)
  const library = allLibraries.value.find(lib => lib.id === libraryId)
  if (library) {
    addLibraryToRow(targetRowIndex, library)
  }

  dragState.value = null
  dragOverRow.value = null
}

function drop(targetRowIndex: number, targetLibIndex: number) {
  dragOverTarget.value = null

  if (!dragState.value) return

  // Only handle row-to-row reordering here
  if (dragState.value.source !== 'row') {
    dragState.value = null
    return
  }

  const sourceRowIndex = dragState.value.rowIndex!
  const sourceLibIndex = dragState.value.libIndex!

  // Only allow reordering within the same row
  if (sourceRowIndex !== targetRowIndex) {
    dragState.value = null
    return
  }

  // Don't do anything if dropping on itself
  if (sourceLibIndex === targetLibIndex) {
    dragState.value = null
    return
  }

  const row = rows.value[sourceRowIndex]
  if (!row) {
    dragState.value = null
    return
  }

  const items = [...row.libraries]
  const [draggedItem] = items.splice(sourceLibIndex, 1)
  if (!draggedItem) {
    dragState.value = null
    return
  }

  // Adjust target index if we removed an item before it
  const adjustedTargetIndex = sourceLibIndex < targetLibIndex ? targetLibIndex - 1 : targetLibIndex
  items.splice(adjustedTargetIndex, 0, draggedItem)

  // Re-order
  items.forEach((lib, idx) => {
    lib.order = idx + 1
  })

  row.libraries = items
  dragState.value = null
}

async function saveConfiguration() {
  if (!globalStartDate.value) {
    toast.add({
      title: 'Validation Error',
      description: 'Global start date is required',
      color: 'error'
    })
    return
  }

  try {
    saving.value = true

    await $fetch('/api/admin/people-group-config/libraries', {
      method: 'PUT',
      body: {
        rows: rows.value,
        global_start_date: globalStartDate.value
      }
    })

    toast.add({
      title: 'Configuration saved',
      description: 'Global configuration has been updated successfully.',
      color: 'success'
    })
  } catch (err: any) {
    toast.add({
      title: 'Failed to save configuration',
      description: err.data?.statusMessage || 'An error occurred while saving the configuration.',
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

function formatDisplayDate(dateString: string): string {
  if (!dateString) return ''
  // Parse as local date to avoid timezone issues (YYYY-MM-DD format)
  const [year, month, day] = dateString.split('-').map(Number)
  const date = new Date(year!, month! - 1, day!)
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

onMounted(async () => {
  await Promise.all([
    loadLibraries(),
    loadConfiguration()
  ])
})
</script>

<style scoped>
.prayer-fuel-order-page {
  max-width: 1400px;
}

.page-header {
  margin-bottom: 2rem;
}

.page-header h1 {
  margin: 0 0 0.5rem;
}

.subtitle {
  margin: 0;
  color: var(--ui-text-muted);
}

.loading, .error {
  text-align: center;
  padding: 2rem;
}

.config-container {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.config-section {
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  padding: 1.5rem;
  background-color: var(--ui-bg);
}

.config-section h3 {
  margin: 0 0 0.5rem;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1rem;
}

.section-header h3 {
  margin: 0;
}

.section-description {
  margin: 0 0 1.5rem;
  font-size: 0.875rem;
  color: var(--ui-text-muted);
  line-height: 1.5;
}

.section-header .section-description {
  margin-bottom: 0;
}

.empty-message {
  text-align: center;
  padding: 2rem;
  color: var(--ui-text-muted);
  font-size: 0.875rem;
}

/* Available Libraries */
.available-libraries {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.library-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--ui-border);
  border-radius: 20px;
  background-color: var(--ui-bg-elevated);
  font-size: 0.875rem;
  cursor: grab;
  transition: all 0.2s;
  user-select: none;
}

.library-chip:hover {
  border-color: var(--text);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.library-chip:active {
  cursor: grabbing;
}

.library-chip.dragging {
  opacity: 0.5;
}

.library-chip-name {
  font-weight: 500;
}

.library-chip-days {
  color: var(--ui-text-muted);
  font-size: 0.75rem;
}

.library-type-icon {
  width: 1rem;
  height: 1rem;
  color: var(--ui-text-muted);
}

.people-group-chip {
  border-color: var(--ui-primary);
  background-color: var(--ui-color-primary-50);
}

.people-group-chip .library-type-icon {
  color: var(--ui-primary);
}

/* Rows */
.rows-container {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.row-card {
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background-color: var(--ui-bg-elevated);
  overflow: hidden;
}

.row-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  background-color: var(--ui-bg);
  border-bottom: 1px solid var(--ui-border);
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.row-label {
  font-weight: 600;
  font-size: 0.9375rem;
}

.row-total-days {
  flex: 1;
  font-size: 0.8125rem;
  color: var(--ui-text-muted);
}

.row-content {
  padding: 1rem;
  transition: all 0.2s;
}

.row-content.drop-target {
  background-color: var(--ui-bg);
  border-radius: 0 0 8px 8px;
  outline: 2px dashed var(--text);
  outline-offset: -2px;
}

.row-empty {
  text-align: center;
  padding: 1rem;
  color: var(--ui-text-muted);
  font-size: 0.875rem;
  border-radius: 6px;
  transition: all 0.2s;
}

.row-empty.drop-highlight {
  border: 2px dashed var(--ui-border);
  background-color: var(--ui-bg);
  color: var(--text);
}

.row-empty p {
  margin: 0;
}

.row-libraries {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.row-library-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  background-color: var(--ui-bg);
  cursor: pointer;
  transition: all 0.2s;
}

.row-library-card:hover {
  border-color: var(--text);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.row-library-card.drag-over {
  border-color: var(--text);
  border-style: dashed;
  background-color: var(--ui-bg-elevated);
}

.row-library-card.dragging {
  opacity: 0.5;
}

.drop-zone-end {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 200px;
  padding: 0.75rem 1rem;
  border: 2px dashed var(--ui-border);
  border-radius: 6px;
  color: var(--ui-text-muted);
  font-size: 0.875rem;
  transition: all 0.2s;
}

.drop-zone-end.drag-over {
  border-color: var(--text);
  background-color: var(--ui-bg-elevated);
  color: var(--text);
}

.drag-handle {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  color: var(--ui-text-muted);
  cursor: move;
  user-select: none;
}

.order-number {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background-color: var(--text);
  color: var(--bg);
  font-size: 0.75rem;
  font-weight: 600;
}

.library-info {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.library-name-row {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.library-info strong {
  font-size: 0.875rem;
}

.people-group-card {
  border-color: var(--ui-primary);
  background-color: var(--ui-color-primary-50);
}

.people-group-card .library-type-icon {
  color: var(--ui-primary);
}

.library-stats {
  font-size: 0.75rem;
  color: var(--ui-text-muted);
}

.add-library-section {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.library-select {
  min-width: 250px;
}


.select-item-content {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.select-item-icon {
  width: 1rem;
  height: 1rem;
  color: var(--ui-primary);
}

.select-item-days {
  margin-left: auto;
  font-size: 0.75rem;
  color: var(--ui-text-muted);
}

.save-section {
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--ui-border);
  display: flex;
  justify-content: flex-end;
}

.full-width {
  width: 100%;
}

.start-date-section {
  display: flex;
  gap: 2rem;
  align-items: flex-start;
}

.date-info {
  padding: 1rem;
  background-color: var(--ui-bg-elevated);
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  min-width: 300px;
}

.date-info p {
  margin: 0 0 0.5rem;
  font-size: 0.875rem;
}

.date-info p:last-child {
  margin-bottom: 0;
}

@media (max-width: 768px) {
  .start-date-section {
    flex-direction: column;
  }

  .date-info {
    width: 100%;
  }

  .row-libraries {
    flex-direction: column;
  }

  .add-library-section {
    flex-direction: column;
    align-items: stretch;
  }

  .library-select {
    min-width: 100%;
  }
}
</style>

<style>
/* Global styles for select menu options (rendered in portal) */
[role="listbox"] [role="option"] {
  cursor: pointer;
}
</style>
