export default defineNuxtPlugin(async () => {
  const { restoreFromCache, checkAuth, setAuthReady } = useAuth()

  // Step 1: Instantly restore from sessionStorage cache (no API call)
  restoreFromCache()

  // Step 2: Only validate with server if auth cookie exists
  // This avoids unnecessary /me requests on public pages for unauthenticated users
  const hasAuthCookie = document.cookie.includes('auth-token')
  if (hasAuthCookie) {
    await checkAuth()
  }

  // Step 3: Mark auth as ready
  setAuthReady(true)
})
