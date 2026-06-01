import { readonly } from 'vue'
import { useState, useRuntimeConfig } from '#imports'

export const usePeopleGroup = () => {
  const config = useRuntimeConfig()
  const appName = config.public.appName || 'Base'

  const peopleGroupTitle = useState<string>('peopleGroupTitle', () => appName)
  const peopleGroupImageUrl = useState<string | null>('peopleGroupImageUrl', () => null)
  const showPeopleGroupHeader = useState<boolean>('showPeopleGroupHeader', () => false)

  const setPeopleGroupTitle = (title: string, imageUrl?: string | null) => {
    peopleGroupTitle.value = title
    peopleGroupImageUrl.value = imageUrl ?? null
    showPeopleGroupHeader.value = true
  }

  const resetPeopleGroupTitle = () => {
    peopleGroupTitle.value = appName
    peopleGroupImageUrl.value = null
    showPeopleGroupHeader.value = false
  }

  return {
    peopleGroupTitle: readonly(peopleGroupTitle),
    peopleGroupImageUrl: readonly(peopleGroupImageUrl),
    showPeopleGroupHeader: readonly(showPeopleGroupHeader),
    setPeopleGroupTitle,
    resetPeopleGroupTitle
  }
}
