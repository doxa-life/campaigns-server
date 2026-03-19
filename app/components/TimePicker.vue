<template>
  <!-- Mobile: use native picker (iOS wheel / Android clock are excellent) -->
  <UInput
    v-if="isMobile"
    type="time"
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    v-bind="$attrs"
  />

  <!-- Desktop: custom clock face with AM/PM toggle -->
  <div v-else class="time-picker-desktop">
    <UInput
      type="text"
      readonly
      :model-value="displayTime"
      :placeholder="placeholder"
      @click="showPicker = true"
      class="cursor-pointer"
      v-bind="$attrs"
    >
      <template #trailing>
        <UIcon
          name="i-lucide-clock"
          class="w-4 h-4 text-[var(--ui-text-muted)] cursor-pointer"
          @click.stop="showPicker = true"
        />
      </template>
    </UInput>

    <!-- Clock Picker Modal -->
    <UModal v-model:open="showPicker">
      <template #content>
        <div class="p-6">
          <!-- Time Display Header -->
          <div class="flex items-center justify-center gap-2 mb-6">
            <button
              @click="selectingHours = true"
              class="text-5xl font-light transition-opacity"
              :class="selectingHours ? 'opacity-100' : 'opacity-40'"
            >
              {{ selectedHour12.toString().padStart(2, '0') }}
            </button>
            <span class="text-5xl font-light">:</span>
            <button
              @click="selectingHours = false"
              class="text-5xl font-light transition-opacity"
              :class="!selectingHours ? 'opacity-100' : 'opacity-40'"
            >
              {{ selectedMinute.toString().padStart(2, '0') }}
            </button>
            <div class="flex flex-col ml-4 gap-1">
              <button
                @click="selectedPeriod = 'AM'"
                class="px-2 py-1 text-sm font-medium rounded transition-all"
                :class="selectedPeriod === 'AM'
                  ? 'bg-[var(--ui-text)] text-[var(--ui-bg)]'
                  : 'text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]'"
              >
                AM
              </button>
              <button
                @click="selectedPeriod = 'PM'"
                class="px-2 py-1 text-sm font-medium rounded transition-all"
                :class="selectedPeriod === 'PM'
                  ? 'bg-[var(--ui-text)] text-[var(--ui-bg)]'
                  : 'text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]'"
              >
                PM
              </button>
            </div>
          </div>

          <!-- Clock Face -->
          <div class="relative w-64 h-64 mx-auto mb-6">
            <!-- Clock circle -->
            <div class="absolute inset-0 rounded-full bg-[var(--ui-bg-elevated)] border border-[var(--ui-border)]" />

            <!-- Clock hand -->
            <div
              class="absolute left-1/2 top-1/2 w-0.5 bg-[var(--ui-text)] rounded-full transition-transform duration-150"
              :style="{
                height: '80px',
                transformOrigin: 'center bottom',
                transform: `translateX(-50%) translateY(-100%) rotate(${handRotation}deg)`
              }"
            />

            <!-- Center dot -->
            <div class="absolute top-1/2 left-1/2 w-3 h-3 -mt-1.5 -ml-1.5 rounded-full bg-[var(--ui-text)]" />

            <!-- Hour numbers (when selecting hours) -->
            <template v-if="selectingHours">
              <button
                v-for="hour in hours12"
                :key="hour"
                @click="selectHour(hour)"
                class="absolute w-10 h-10 -mt-5 -ml-5 flex items-center justify-center rounded-full text-sm font-medium transition-all"
                :class="selectedHour12 === hour
                  ? 'bg-[var(--ui-text)] text-[var(--ui-bg)]'
                  : 'hover:bg-[var(--ui-bg-elevated)]'"
                :style="getPositionStyle(hour, 12)"
              >
                {{ hour }}
              </button>
            </template>

            <!-- Minute numbers (when selecting minutes) -->
            <template v-else>
              <button
                v-for="minute in minuteMarkers"
                :key="minute"
                @click="selectMinute(minute)"
                class="absolute w-10 h-10 -mt-5 -ml-5 flex items-center justify-center rounded-full text-sm font-medium transition-all"
                :class="selectedMinute === minute
                  ? 'bg-[var(--ui-text)] text-[var(--ui-bg)]'
                  : 'hover:bg-[var(--ui-bg-elevated)]'"
                :style="getPositionStyle(minute, 60)"
              >
                {{ minute.toString().padStart(2, '0') }}
              </button>
            </template>
          </div>

          <!-- Action Buttons -->
          <div class="flex justify-end gap-2 pt-4 border-t border-[var(--ui-border)]">
            <UButton variant="ghost" @click="showPicker = false">Cancel</UButton>
            <UButton @click="confirmSelection">OK</UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
defineOptions({
  inheritAttrs: false
})

const props = withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
}>(), {
  placeholder: 'Select time'
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

// Detect mobile device
const isMobile = computed(() => {
  if (import.meta.server) return false
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
})

// Modal and selection state
const showPicker = ref(false)
const selectingHours = ref(true)
const selectedHour12 = ref(9)
const selectedMinute = ref(0)
const selectedPeriod = ref<'AM' | 'PM'>('AM')

// Clock numbers
const hours12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const minuteMarkers = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]

// Format time for display
const displayTime = computed(() => {
  if (!props.modelValue) return ''
  const [hours = 0, minutes = 0] = props.modelValue.split(':').map(Number)
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`
})

// Clock hand rotation
const handRotation = computed(() => {
  if (selectingHours.value) {
    // For hours: 12 is at top (0°), each hour is 30°
    const hour = selectedHour12.value === 12 ? 0 : selectedHour12.value
    return hour * 30
  } else {
    // For minutes: 0 is at top (0°), each minute is 6°
    return selectedMinute.value * 6
  }
})

// Get position for clock numbers
function getPositionStyle(value: number, total: number) {
  const angle = (value / total) * 360 - 90 // -90 to start from top
  const radius = 100 // pixels from center
  const x = 128 + radius * Math.cos((angle * Math.PI) / 180)
  const y = 128 + radius * Math.sin((angle * Math.PI) / 180)
  return { left: `${x}px`, top: `${y}px` }
}

// Select hour
function selectHour(hour: number) {
  selectedHour12.value = hour
  // Auto-advance to minutes
  setTimeout(() => {
    selectingHours.value = false
  }, 150)
}

// Select minute
function selectMinute(minute: number) {
  selectedMinute.value = minute
}

// Initialize picker when opened
watch(showPicker, (isOpen) => {
  if (isOpen && props.modelValue) {
    const [hours = 0, minutes = 0] = props.modelValue.split(':').map(Number)
    selectedHour12.value = hours % 12 || 12
    selectedMinute.value = minutes
    selectedPeriod.value = hours >= 12 ? 'PM' : 'AM'
    selectingHours.value = true
  }
})

// Confirm selection
function confirmSelection() {
  let hour24 = selectedHour12.value
  if (selectedPeriod.value === 'PM' && hour24 !== 12) {
    hour24 += 12
  } else if (selectedPeriod.value === 'AM' && hour24 === 12) {
    hour24 = 0
  }

  const timeStr = `${hour24.toString().padStart(2, '0')}:${selectedMinute.value.toString().padStart(2, '0')}`
  emit('update:modelValue', timeStr)
  showPicker.value = false
}
</script>

<style scoped>
.time-picker-desktop {
  position: relative;
}
</style>
