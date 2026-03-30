<template>
  <UModal
    v-model:open="isOpen"
    :title="title"
  >
    <template #body>
      <div class="confirm-modal-body">
        <p v-if="message">{{ message }}</p>
        <p v-if="warning" class="warning-text">
          {{ warning }}
        </p>
      </div>
    </template>
    <template #footer>
      <div class="confirm-modal-actions">
        <UButton
          @click="handleCancel"
          variant="outline"
        >
          {{ cancelText }}
        </UButton>
        <UButton
          @click="handleConfirm"
          :color="confirmColor"
          :loading="loading"
        >
          {{ confirmText }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  open?: boolean
  title?: string
  message?: string
  warning?: string
  confirmText?: string
  cancelText?: string
  confirmColor?: 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral'
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  open: true,
  title: 'Confirm',
  confirmText: 'Confirm',
  cancelText: 'Cancel',
  confirmColor: 'primary',
  loading: false
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: []
  cancel: []
  close: [confirmed: boolean]
}>()

const isOpen = computed({
  get: () => props.open,
  set: (value) => emit('update:open', value)
})

function handleConfirm() {
  emit('confirm')
  emit('close', true)
}

function handleCancel() {
  emit('cancel')
  emit('close', false)
  isOpen.value = false
}
</script>

<style scoped>
.confirm-modal-body {
  padding: 1.5rem;
}

.confirm-modal-body p {
  margin: 0 0 1rem;
  line-height: 1.5;
}

.confirm-modal-body p:last-child {
  margin-bottom: 0;
}

.warning-text {
  color: var(--ui-text-muted);
  font-size: 0.875rem;
}

.confirm-modal-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
}
</style>
