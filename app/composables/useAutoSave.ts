import { ref, toRaw, type Ref } from 'vue'

type FieldStrategy = 'text' | 'immediate'

interface UseAutoSaveOptions<T extends Record<string, any>> {
  saveFn: (data: T) => Promise<T | void>
  onSaved?: () => void
  onError?: (error: any) => void
}

function deepClone<T>(data: T): T {
  return JSON.parse(JSON.stringify(data))
}

export function useAutoSave<T extends Record<string, any>>(
  initialData: T,
  options: UseAutoSaveOptions<T>
) {
  const formData = ref(deepClone(initialData)) as Ref<T>
  const snapshot = ref(deepClone(initialData)) as Ref<T>
  const saving = ref(false)
  const savedField = ref<string | null>(null)

  let savedTimer: ReturnType<typeof setTimeout> | null = null
  let saveQueued = false
  let inFlight = false

  function hasChanges(): boolean {
    return JSON.stringify(formData.value) !== JSON.stringify(snapshot.value)
  }

  async function doSave() {
    if (!hasChanges()) return

    if (inFlight) {
      saveQueued = true
      return
    }

    inFlight = true
    saving.value = true
    const dataToSend = deepClone(toRaw(formData.value))

    try {
      const result = await options.saveFn(dataToSend)
      snapshot.value = result ? deepClone(toRaw(result)) : deepClone(dataToSend)

      if (savedTimer) clearTimeout(savedTimer)
      savedField.value = 'saved'
      savedTimer = setTimeout(() => { savedField.value = null }, 1500)

      options.onSaved?.()
    } catch (err: any) {
      options.onError?.(err)
    } finally {
      inFlight = false
      saving.value = false

      if (saveQueued) {
        saveQueued = false
        await doSave()
      }
    }
  }

  function fieldChanged(_key: string, strategy: FieldStrategy = 'immediate') {
    if (strategy === 'text') return
    doSave()
  }

  function reset(data: T) {
    flush()
    formData.value = deepClone(toRaw(data))
    snapshot.value = deepClone(toRaw(data))
  }

  function flush() {
    if (hasChanges()) {
      doSave()
    }
  }

  return {
    formData,
    saving,
    savedField,
    fieldChanged,
    reset,
    flush
  }
}
