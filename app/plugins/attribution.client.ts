// Records where this visit came from (utm-tagged link or external referrer) so
// the signup form can attribute the signup to it. Runs on every full page load,
// which is exactly when a visitor arrives from another site.
import { captureAttribution } from '~/utils/attribution'

export default defineNuxtPlugin(() => {
  captureAttribution()
})
