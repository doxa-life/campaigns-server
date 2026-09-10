<script setup lang="ts">
// Floating entry point for the portfolio assistant, mounted by the admin
// layout so it is reachable from every admin page. Hidden until the status
// probe says the assistant can run, and for users without context access.
const { open, openPanel } = useContextAssistant()
const { available } = useContextAssistantStatus()
const { canAccess } = useAuthUser()

const visible = computed(() => available.value && canAccess('context.view'))
</script>

<template>
  <template v-if="visible">
    <Teleport to="body">
      <UButton
        v-if="!open"
        icon="i-lucide-sparkles"
        size="xl"
        color="primary"
        class="fixed bottom-6 right-6 z-40 rounded-full shadow-lg"
        aria-label="Open assistant"
        title="Context assistant"
        @click="openPanel()"
      />
    </Teleport>
    <ContextAssistantPanel />
  </template>
</template>
