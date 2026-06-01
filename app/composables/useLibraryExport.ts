import { useToast } from '#imports'

export const useLibraryExport = () => {
  const toast = useToast()

  const exportLibrary = async (library: { id: number; name: string }) => {
    try {
      const response = await $fetch(`/api/admin/libraries/${library.id}/export`)
      const blob = new Blob([JSON.stringify(response, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `library-${library.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)

      toast.add({
        title: 'Export successful',
        description: `"${library.name}" has been exported.`,
        color: 'success'
      })
    } catch (error: any) {
      toast.add({
        title: 'Export failed',
        description: error.data?.statusMessage || 'An error occurred while exporting the library.',
        color: 'error'
      })
    }
  }

  return {
    exportLibrary
  }
}
