import { useOverlay } from '#imports'
import ErrorModal from '~/components/ErrorModal.vue'
import ConfirmModal from '~/components/ConfirmModal.vue'
import PromptModal from '~/components/PromptModal.vue'

export const useModal = () => {
  const overlay = useOverlay()

  const showError = async (message: string) => {
    const modal = overlay.create(ErrorModal)
    const instance = modal.open({ message })
    await instance.result
  }

  const showConfirm = async (
    message: string,
    options?: { title?: string; confirmText?: string }
  ): Promise<boolean> => {
    const modal = overlay.create(ConfirmModal)
    const instance = modal.open({
      message,
      title: options?.title,
      confirmText: options?.confirmText
    })
    const result = await instance.result
    return result === true
  }

  const showPrompt = async (options: {
    title?: string
    message?: string
    placeholder?: string
    confirmText?: string
    cancelText?: string
    defaultValue?: string
  }): Promise<string> => {
    const modal = overlay.create(PromptModal)
    const instance = modal.open(options)
    const result = await instance.result

    // If cancelled (null) or empty, throw to indicate cancellation
    if (result === null || result === undefined) {
      throw new Error('Prompt cancelled')
    }

    return result
  }

  return {
    showError,
    showConfirm,
    showPrompt
  }
}
