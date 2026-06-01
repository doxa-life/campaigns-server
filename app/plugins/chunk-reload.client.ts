export default defineNuxtPlugin(() => {
  const router = useRouter()

  router.onError((error) => {
    if (
      error.message.includes('Failed to fetch dynamically imported module') ||
      error.message.includes('Importing a module script failed')
    ) {
      window.location.href = router.currentRoute.value.fullPath
    }
  })
})
