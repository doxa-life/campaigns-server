<script setup lang="ts">
// The portfolio/section tree beside every context page. Fixed on large
// screens, a slideover on small ones.
const open = defineModel<boolean>('open', { default: false })
const createOpen = ref(false)

const route = useRoute()
watch(() => route.path, () => { open.value = false })

function startCreate() {
  open.value = false
  createOpen.value = true
}
</script>

<template>
  <aside class="hidden lg:flex flex-col w-64 shrink-0 overflow-y-auto p-3">
    <ContextSidebarBody @create="startCreate" />
  </aside>

  <USlideover
    v-model:open="open"
    side="left"
    :ui="{ content: 'max-w-xs' }"
  >
    <template #content>
      <div class="flex flex-col h-full overflow-y-auto p-3">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-xl font-semibold">
            Context
          </h2>
          <UButton
            icon="i-lucide-x"
            variant="ghost"
            color="neutral"
            aria-label="Close menu"
            @click="() => { open = false }"
          />
        </div>
        <ContextSidebarBody @navigated="open = false" @create="startCreate" />
      </div>
    </template>
  </USlideover>

  <ContextCreatePortfolioModal v-model:open="createOpen" />
</template>
