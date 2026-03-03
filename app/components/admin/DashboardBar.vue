<template>
  <div class="w-full flex flex-col gap-3">
    <div class="flex items-center gap-3">
      <span class="text-xs text-[var(--ui-text-dimmed)] w-24 text-right shrink-0">{{ activeLabel }}</span>
      <div class="flex-1">
        <div
          class="h-7 rounded transition-all duration-500"
          :style="{ width: activeWidth + '%', backgroundColor: activeColor }"
        />
      </div>
      <span class="text-xs font-semibold w-8 shrink-0">{{ activeValue }}</span>
    </div>
    <div class="flex items-center gap-3">
      <span class="text-xs text-[var(--ui-text-dimmed)] w-24 text-right shrink-0">{{ inactiveLabel }}</span>
      <div class="flex-1">
        <div
          class="h-7 rounded bg-[var(--ui-bg-accented)] transition-all duration-500"
          :style="{ width: inactiveWidth + '%' }"
        />
      </div>
      <span class="text-xs font-semibold w-8 shrink-0">{{ inactiveValue }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  activeValue: number
  inactiveValue: number
  activeLabel: string
  inactiveLabel: string
  activeColor: string
}>()

const max = computed(() => Math.max(props.activeValue, props.inactiveValue, 1))
const activeWidth = computed(() => (props.activeValue / max.value) * 100)
const inactiveWidth = computed(() => (props.inactiveValue / max.value) * 100)
</script>
