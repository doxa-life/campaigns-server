// Enables the global feedback web-component for authenticated users by
// writing the localStorage flag the bundle reads on startup. Mirrors what
// marketing-rebuild does inside useAuth (login + checkAuth call
// enableFeedbackWidget()). Doing it as a plugin keeps the base-layer useAuth
// untouched — we just watch isLoggedIn and set the flag once it flips true.
export default defineNuxtPlugin(() => {
  const { isLoggedIn } = useAuth()

  watch(
    () => isLoggedIn.value,
    (loggedIn) => {
      if (!loggedIn) return
      try {
        localStorage.setItem('show-feedback-widget', 'true')
      } catch {
        // ignore (private mode / storage disabled)
      }
    },
    { immediate: true }
  )
})
