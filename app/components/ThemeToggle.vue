<script setup lang="ts">
const { theme, toggleTheme } = useTheme()
</script>

<template>
  <UButton
    variant="ghost"
    color="neutral"
    size="lg"
    @click="toggleTheme"
    :aria-label="theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'"
    title="Toggle theme"
  >
    <UIcon v-if="theme === 'light'" name="i-lucide-moon" class="size-5" />
    <UIcon v-else name="i-lucide-sun" class="size-5" />
  </UButton>
</template>
