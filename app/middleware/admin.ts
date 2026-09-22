export default defineNuxtRouteMiddleware(async (to, from) => {
  // Only run on client side
  if (process.server) return

  const { user, isAdmin, checkAuth } = useAuthUser()

  // Fetch user if not already loaded
  if (!user.value) {
    await checkAuth()
  }

  if (!user.value) {
    return navigateTo('/')
  }

  // Redirect to the admin dashboard if the user does not hold the admin role
  if (!isAdmin.value) {
    return navigateTo('/admin')
  }
})
