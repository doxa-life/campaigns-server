<template>
  <UModal :title="title || 'Input'">
    <template #body>
      <p v-if="message" class="text-gray-700 mb-4">{{ message }}</p>
      <UInput
        v-model="inputValue"
        :placeholder="placeholder || 'Enter value...'"
        @keydown.enter="handleConfirm"
        @keydown.esc="handleCancel"
        autofocus
      />
    </template>
    <template #footer="{ close }">
      <UButton color="neutral" variant="outline" @click="handleCancel(close)">
        {{ cancelText || 'Cancel' }}
      </UButton>
      <UButton color="primary" class="ml-auto" @click="handleConfirm(close)">
        {{ confirmText || 'OK' }}
      </UButton>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  title?: string
  message?: string
  placeholder?: string
  confirmText?: string
  cancelText?: string
  defaultValue?: string
}>()

const emit = defineEmits<{
  close: [value: string | null]
}>()

const inputValue = ref(props.defaultValue || '')

const handleConfirm = (close?: () => void) => {
  if (close) close()
  emit('close', inputValue.value)
}

const handleCancel = (close?: () => void) => {
  if (close) close()
  emit('close', null)
}
</script>
