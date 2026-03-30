<script setup lang="ts">
import { ref, computed, useTemplateRef } from 'vue'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/vue-3'
import { isValidPosition, focusNextNode } from '~/utils/tiptap'

const props = defineProps<NodeViewProps>()

interface FileItem {
  id: string
  file: File
  progress: number
  status: 'uploading' | 'success' | 'error'
  url?: string
  abortController?: AbortController
}

const { accept, limit, maxSize } = props.node.attrs
const extension = props.extension as any
const fileUploadRef = useTemplateRef('fileUploadRef')
const fileItems = ref<FileItem[]>([])

// Upload a single file
const uploadFile = async (file: File): Promise<string | null> => {
  if (maxSize > 0 && file.size > maxSize) {
    const error = new Error(
      `File size exceeds maximum allowed (${maxSize / 1024 / 1024}MB)`
    )
    extension.options.onError?.(error)
    return null
  }

  const abortController = new AbortController()
  const fileId = crypto.randomUUID()

  const newFileItem: FileItem = {
    id: fileId,
    file,
    progress: 0,
    status: 'uploading',
    abortController,
  }

  fileItems.value = [...fileItems.value, newFileItem]

  try {
    if (!extension.options.upload) {
      throw new Error('Upload function is not defined')
    }

    const url = await extension.options.upload(
      file,
      (event: { progress: number }) => {
        fileItems.value = fileItems.value.map((item) =>
          item.id === fileId ? { ...item, progress: event.progress } : item
        )
      },
      abortController.signal
    )

    if (!url) throw new Error('Upload failed: No URL returned')

    if (!abortController.signal.aborted) {
      fileItems.value = fileItems.value.map((item) =>
        item.id === fileId
          ? { ...item, status: 'success', url, progress: 100 }
          : item
      )
      extension.options.onSuccess?.(url)
      return url
    }

    return null
  } catch (error) {
    if (!abortController.signal.aborted) {
      fileItems.value = fileItems.value.map((item) =>
        item.id === fileId ? { ...item, status: 'error', progress: 0 } : item
      )
      extension.options.onError?.(
        error instanceof Error ? error : new Error('Upload failed')
      )
    }
    return null
  }
}

// Upload multiple files
const uploadFiles = async (files: File[]): Promise<string[]> => {
  if (!files || files.length === 0) {
    extension.options.onError?.(new Error('No files to upload'))
    return []
  }

  if (limit && files.length > limit) {
    extension.options.onError?.(
      new Error(
        `Maximum ${limit} file${limit === 1 ? '' : 's'} allowed`
      )
    )
    return []
  }

  // Upload all files concurrently
  const uploadPromises = files.map((file) => uploadFile(file))
  const results = await Promise.all(uploadPromises)

  // Filter out null results (failed uploads)
  return results.filter((url): url is string => url !== null)
}

// Handle file upload and replace node with images
const handleUpload = async (files: File[]) => {
  const urls = await uploadFiles(files)

  if (urls.length > 0) {
    const pos = props.getPos()

    if (isValidPosition(pos)) {
      const imageNodes = urls.map((url, index) => {
        const filename =
          files[index]?.name.replace(/\.[^/.]+$/, '') || 'unknown'
        return {
          type: extension.options.type || 'image',
          attrs: {
            src: url,
            alt: filename,
            title: filename,
          },
        }
      })

      props.editor
        .chain()
        .focus()
        .deleteRange({ from: pos, to: pos + props.node.nodeSize })
        .insertContentAt(pos, imageNodes)
        .run()

      focusNextNode(props.editor)
    }
  }
}

// Handle file selection from UFileUpload
const onFileChange = () => {
  const input = fileUploadRef.value?.inputRef
  if (!input?.files?.length) return

  const files = Array.from(input.files) as File[]
  handleUpload(files)
}

// Remove a file from upload queue
const removeFileItem = (fileId: string) => {
  const fileToRemove = fileItems.value.find((item) => item.id === fileId)
  if (fileToRemove?.abortController) {
    fileToRemove.abortController.abort()
  }
  if (fileToRemove?.url) {
    URL.revokeObjectURL(fileToRemove.url)
  }
  fileItems.value = fileItems.value.filter((item) => item.id !== fileId)
}

// Clear all files
const clearAllFiles = () => {
  fileItems.value.forEach((item) => {
    if (item.abortController) {
      item.abortController.abort()
    }
    if (item.url) {
      URL.revokeObjectURL(item.url)
    }
  })
  fileItems.value = []
}

// Format file size
const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

const hasFiles = computed(() => fileItems.value.length > 0)
const isUploading = computed(() => fileItems.value.some(f => f.status === 'uploading'))
const hasError = computed(() => fileItems.value.some(f => f.status === 'error'))
const currentProgress = computed(() => {
  const uploading = fileItems.value.filter(f => f.status === 'uploading')
  if (uploading.length === 0) return 0
  return Math.round(uploading.reduce((sum, f) => sum + f.progress, 0) / uploading.length)
})
</script>

<template>
  <NodeViewWrapper class="my-6">
    <!-- Dropzone (shown when no files uploading) -->
    <UFileUpload
      v-if="!hasFiles"
      ref="fileUploadRef"
      :accept="accept"
      :multiple="limit > 1"
      label="Upload an image"
      :description="`Maximum ${limit} file${limit === 1 ? '' : 's'}, ${maxSize / 1024 / 1024}MB each`"
      :preview="false"
      class="min-h-40"
      @update:model-value="onFileChange"
    >
      <template #leading>
        <UAvatar
          icon="i-lucide-image"
          size="xl"
        />
      </template>
    </UFileUpload>

    <!-- File previews (shown during upload) -->
    <div v-if="hasFiles" class="space-y-3">
      <div v-if="fileItems.length > 1" class="flex items-center justify-between pb-2 border-b border-(--ui-border)">
        <span class="text-sm font-medium text-(--ui-text)">Uploading {{ fileItems.length }} files</span>
        <UButton
          variant="ghost"
          size="xs"
          color="neutral"
          @click.stop="clearAllFiles"
        >
          Clear All
        </UButton>
      </div>

      <div
        v-for="fileItem in fileItems"
        :key="fileItem.id"
        class="relative rounded-lg overflow-hidden"
      >
        <!-- Progress bar background -->
        <div
          v-if="fileItem.status === 'uploading'"
          class="absolute inset-0 bg-primary/10 transition-all duration-300"
          :style="{ width: `${fileItem.progress}%` }"
        />

        <div class="relative border border-(--ui-border) rounded-lg p-3 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <UAvatar
              :icon="fileItem.status === 'error' ? 'i-lucide-alert-circle' : fileItem.status === 'uploading' ? 'i-lucide-loader-circle' : 'i-lucide-check'"
              size="sm"
              :ui="{
                icon: [
                  fileItem.status === 'uploading' && 'animate-spin',
                  fileItem.status === 'error' && 'text-error'
                ]
              }"
            />
            <div class="flex flex-col">
              <span class="text-sm font-medium text-(--ui-text) truncate max-w-48">{{ fileItem.file.name }}</span>
              <span class="text-xs text-(--ui-text-muted)">{{ formatFileSize(fileItem.file.size) }}</span>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <span
              v-if="fileItem.status === 'uploading'"
              class="text-xs font-semibold text-primary"
            >
              {{ fileItem.progress }}%
            </span>
            <UButton
              icon="i-lucide-x"
              variant="ghost"
              size="xs"
              color="neutral"
              @click.stop="removeFileItem(fileItem.id)"
            />
          </div>
        </div>
      </div>
    </div>
  </NodeViewWrapper>
</template>

