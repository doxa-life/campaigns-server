import { readonly } from 'vue'
import { useState, useRuntimeConfig } from '#imports'

export const usePeopleGroup = () => {
  const config = useRuntimeConfig()
  const appName = config.public.appName || 'Base'

  const peopleGroupTitle = useState<string>('peopleGroupTitle', () => appName)
  const showPeopleGroupHeader = useState<boolean>('showPeopleGroupHeader', () => false)

  const setPeopleGroupTitle = (title: string) => {
    peopleGroupTitle.value = title
    showPeopleGroupHeader.value = true
  }

  const resetPeopleGroupTitle = () => {
    peopleGroupTitle.value = appName
    showPeopleGroupHeader.value = false
  }

  return {
    peopleGroupTitle: readonly(peopleGroupTitle),
    showPeopleGroupHeader: readonly(showPeopleGroupHeader),
    setPeopleGroupTitle,
    resetPeopleGroupTitle
  }
}
