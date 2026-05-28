export default defineNuxtRouteMiddleware(async (to, _from) => {
  const { user, checkAuth } = useAuth()

  // Only fetch if user is not already loaded
  if (!user.value) {
    const authUser = await checkAuth()

    if (!authUser) {
      // Include the current path as redirect parameter
      const redirectUrl = to.fullPath
      return navigateTo(`/login?redirect=${encodeURIComponent(redirectUrl)}`)
    }
  }
});