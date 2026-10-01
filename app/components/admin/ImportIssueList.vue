<template>
  <div v-if="issues.length > 0">
    <p class="text-sm font-medium mb-1" :class="color === 'error' ? 'text-error' : 'text-warning'">
      {{ title }} ({{ issues.length }})
    </p>
    <ul class="text-sm text-muted max-h-40 overflow-y-auto list-disc list-inside">
      <li v-for="issue in issues" :key="`${issue.row}-${issue.message}`">
        Row {{ issue.row }}<template v-if="issue.peid"> (PEID {{ issue.peid }})</template>: {{ issue.message }}
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  issues: { row: number; peid: string | null; message: string }[]
  color: 'error' | 'warning'
}>()
</script>
