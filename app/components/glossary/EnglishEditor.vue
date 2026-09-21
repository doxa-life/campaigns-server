<template>
  <div>
    <div v-if="loading" class="flex items-center justify-center py-12">
      <UIcon name="i-lucide-loader" class="w-6 h-6 animate-spin" />
      <span class="ml-2">Loading...</span>
    </div>

    <UAlert v-else-if="error" color="error" :title="error" />

    <div v-else class="flex flex-col gap-6">
      <UAlert
        color="info"
        variant="subtle"
        icon="i-lucide-info"
        title="The English glossary is the authority"
        description="Editing a term's wording or its notes invalidates every review of it: confirmed translations drop back to draft and are marked stale."
      />

      <section v-for="section in sections" :key="section.id" class="border border-[var(--ui-border)] rounded-lg">
        <header class="flex items-start justify-between gap-3 p-4 border-b border-[var(--ui-border)]">
          <div class="min-w-0">
            <h3 class="font-semibold">{{ section.title }}</h3>
            <p v-if="section.intro" class="text-sm text-[var(--ui-text-muted)] mt-1">{{ section.intro }}</p>
          </div>
          <div v-if="canManage" class="flex items-center gap-1 shrink-0">
            <UButton
              icon="i-lucide-plus"
              size="xs"
              variant="ghost"
              color="neutral"
              @click="startNewTerm(section.id)"
            >
              Term
            </UButton>
            <UButton
              icon="i-lucide-pencil"
              size="xs"
              variant="ghost"
              color="neutral"
              aria-label="Edit section"
              @click="editSection(section)"
            />
          </div>
        </header>

        <ul class="divide-y divide-[var(--ui-border)]">
          <li
            v-for="term in section.terms"
            :key="term.id"
            class="flex items-start justify-between gap-3 px-4 py-3"
          >
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-medium">{{ term.term }}</span>
                <UBadge v-if="term.acronym" color="neutral" variant="subtle" size="xs">{{ term.acronym }}</UBadge>
                <UBadge v-if="term.seed" color="neutral" variant="outline" size="xs">seed</UBadge>
              </div>
              <p
                v-for="field in term.fields"
                :key="field.label"
                class="text-sm text-[var(--ui-text-muted)] mt-1"
              >
                <span class="font-medium">{{ field.label }}.</span> {{ field.value }}
              </p>
            </div>
            <div v-if="canManage" class="flex items-center gap-1 shrink-0">
              <UButton
                icon="i-lucide-pencil"
                size="xs"
                variant="ghost"
                color="neutral"
                aria-label="Edit term"
                @click="editTerm(section.id, term)"
              />
              <UButton
                icon="i-lucide-trash-2"
                size="xs"
                variant="ghost"
                color="error"
                aria-label="Delete term"
                @click="confirmDeleteTerm(term)"
              />
            </div>
          </li>
          <li v-if="section.terms.length === 0" class="px-4 py-6 text-sm text-[var(--ui-text-muted)]">
            No terms in this section yet.
          </li>
        </ul>
      </section>

      <div v-if="canManage">
        <UButton icon="i-lucide-plus" variant="outline" color="neutral" @click="startNewSection">
          Add section
        </UButton>
      </div>
    </div>

    <UModal v-model:open="termModalOpen" :title="termForm.id ? 'Edit term' : 'New term'">
      <template #body>
        <div class="flex flex-col gap-4">
          <UFormField label="English term" required>
            <UInput v-model="termForm.term" class="w-full" />
          </UFormField>

          <UFormField
            label="Acronym"
            help="For a term known by one, such as UPG. Every language uses it unless its reviewer enters their own."
          >
            <UInput v-model="termForm.acronym" class="w-40" />
          </UFormField>

          <div class="flex flex-col gap-3">
            <div
              v-for="(field, index) in termForm.fields"
              :key="index"
              class="flex flex-col gap-2 border border-[var(--ui-border)] rounded-lg p-3"
            >
              <div class="flex items-center gap-2">
                <UInput v-model="field.label" placeholder="Label" class="flex-1" />
                <UButton
                  icon="i-lucide-x"
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  aria-label="Remove annotation"
                  @click="() => { termForm.fields.splice(index, 1) }"
                />
              </div>
              <UTextarea v-model="field.value" :rows="3" placeholder="Value" class="w-full" />
            </div>
            <UButton icon="i-lucide-plus" size="xs" variant="ghost" color="neutral" @click="addField">
              Add annotation
            </UButton>
          </div>

          <UCheckbox v-model="termForm.seed" label="Seed term" />
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" @click="() => { termModalOpen = false }">Cancel</UButton>
          <UButton :loading="saving" @click="saveTerm">Save</UButton>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="sectionModalOpen" :title="sectionForm.id ? 'Edit section' : 'New section'">
      <template #body>
        <div class="flex flex-col gap-4">
          <UFormField label="Title" required>
            <UInput v-model="sectionForm.title" class="w-full" />
          </UFormField>
          <UFormField label="Intro">
            <UTextarea v-model="sectionForm.intro" :rows="3" class="w-full" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-between gap-2 w-full">
          <UButton
            v-if="sectionForm.id"
            color="error"
            variant="ghost"
            @click="confirmDeleteSection"
          >
            Delete section
          </UButton>
          <div class="flex gap-2 ml-auto">
            <UButton color="neutral" variant="ghost" @click="() => { sectionModalOpen = false }">Cancel</UButton>
            <UButton :loading="saving" @click="saveSection">Save</UButton>
          </div>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="confirmOpen" :title="confirmTitle">
      <template #body>
        <p class="text-sm">{{ confirmBody }}</p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" @click="() => { confirmOpen = false }">Cancel</UButton>
          <UButton color="error" :loading="saving" @click="runConfirmed">Delete</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
interface Field { label: string; value: string }
interface Term { id: string; term: string; acronym: string | null; seed: boolean; fields: Field[] }
interface Section { id: string; title: string; intro: string; terms: Term[] }

defineProps<{ canManage: boolean }>()
const emit = defineEmits<{ changed: [] }>()

const toast = useToast()

const sections = ref<Section[]>([])
const loading = ref(true)
const error = ref('')
const saving = ref(false)

const termModalOpen = ref(false)
const sectionModalOpen = ref(false)
const termForm = ref<{
  id: string | null
  section_id: string
  term: string
  acronym: string
  seed: boolean
  fields: Field[]
}>({
  id: null,
  section_id: '',
  term: '',
  acronym: '',
  seed: false,
  fields: []
})
const sectionForm = ref<{ id: string | null; title: string; intro: string }>({ id: null, title: '', intro: '' })

const confirmOpen = ref(false)
const confirmTitle = ref('')
const confirmBody = ref('')
let confirmAction: (() => Promise<void>) | null = null

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await $fetch<{ sections: Section[] }>('/api/admin/glossary/english')
    sections.value = data.sections
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'Failed to load the glossary'
  } finally {
    loading.value = false
  }
}

function startNewTerm(sectionId: string) {
  termForm.value = { id: null, section_id: sectionId, term: '', acronym: '', seed: false, fields: [] }
  termModalOpen.value = true
}

function editTerm(sectionId: string, term: Term) {
  termForm.value = {
    id: term.id,
    section_id: sectionId,
    term: term.term,
    acronym: term.acronym || '',
    seed: term.seed,
    fields: term.fields.map(field => ({ ...field }))
  }
  termModalOpen.value = true
}

function addField() {
  termForm.value.fields.push({ label: '', value: '' })
}

async function saveTerm() {
  if (!termForm.value.term.trim()) {
    toast.add({ title: 'A term is required', color: 'error' })
    return
  }
  saving.value = true
  try {
    const fields = termForm.value.fields.filter(field => field.label.trim() && field.value.trim())
    if (termForm.value.id) {
      await $fetch(`/api/admin/glossary/terms/${termForm.value.id}`, {
        method: 'PATCH',
        body: { term: termForm.value.term, acronym: termForm.value.acronym, fields, seed: termForm.value.seed }
      })
    } else {
      await $fetch('/api/admin/glossary/terms', {
        method: 'POST',
        body: {
          section_id: termForm.value.section_id,
          term: termForm.value.term,
          acronym: termForm.value.acronym,
          fields,
          seed: termForm.value.seed
        }
      })
    }
    termModalOpen.value = false
    await load()
    emit('changed')
  } catch (e: any) {
    toast.add({ title: 'Could not save the term', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    saving.value = false
  }
}

function startNewSection() {
  sectionForm.value = { id: null, title: '', intro: '' }
  sectionModalOpen.value = true
}

function editSection(section: Section) {
  sectionForm.value = { id: section.id, title: section.title, intro: section.intro }
  sectionModalOpen.value = true
}

async function saveSection() {
  if (!sectionForm.value.title.trim()) {
    toast.add({ title: 'A title is required', color: 'error' })
    return
  }
  saving.value = true
  try {
    if (sectionForm.value.id) {
      await $fetch(`/api/admin/glossary/sections/${sectionForm.value.id}`, {
        method: 'PATCH',
        body: { title: sectionForm.value.title, intro: sectionForm.value.intro }
      })
    } else {
      await $fetch('/api/admin/glossary/sections', {
        method: 'POST',
        body: { title: sectionForm.value.title, intro: sectionForm.value.intro }
      })
    }
    sectionModalOpen.value = false
    await load()
    emit('changed')
  } catch (e: any) {
    toast.add({ title: 'Could not save the section', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    saving.value = false
  }
}

function askConfirm(title: string, body: string, action: () => Promise<void>) {
  confirmTitle.value = title
  confirmBody.value = body
  confirmAction = action
  confirmOpen.value = true
}

function confirmDeleteTerm(term: Term) {
  askConfirm(
    'Delete term',
    `“${term.term}” and its wording in every language will be removed.`,
    async () => {
      await $fetch(`/api/admin/glossary/terms/${term.id}`, { method: 'DELETE' })
    }
  )
}

function confirmDeleteSection() {
  const id = sectionForm.value.id
  if (!id) return
  askConfirm(
    'Delete section',
    'The section and every term in it will be removed, in every language.',
    async () => {
      await $fetch(`/api/admin/glossary/sections/${id}`, { method: 'DELETE' })
      sectionModalOpen.value = false
    }
  )
}

async function runConfirmed() {
  if (!confirmAction) return
  saving.value = true
  try {
    await confirmAction()
    confirmOpen.value = false
    await load()
    emit('changed')
  } catch (e: any) {
    toast.add({ title: 'Could not delete', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    saving.value = false
    confirmAction = null
  }
}

onMounted(load)
</script>
