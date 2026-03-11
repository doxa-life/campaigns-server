import { peopleGroupAdoptionService } from '../database/people-group-adoptions'
import { groupService } from '../database/groups'
import { subscriberService } from '../database/subscribers'
import { contactMethodService } from '../database/contact-methods'
import { sendAdoptionReminderEmail } from '../utils/adoption-reminder-email'

/**
 * Nitro plugin to send monthly adoption reminder emails
 *
 * Runs on the 1st of every month. For each group with active adoptions,
 * sends one email to the primary subscriber listing all their adopted people groups
 * with individual magic links.
 */
export default defineNitroPlugin((nitroApp) => {
  if (process.env.VITEST) return

  // Temporarily disabled
  return

  console.log('📅 Scheduling monthly adoption reminder emails (1st of each month)')

  let lastSentMonth: string | null = null

  // Check every hour if it's the 1st and we haven't sent this month
  const interval = setInterval(async () => {
    const now = new Date()
    const day = now.getDate()
    const monthKey = `${now.getFullYear()}-${now.getMonth()}`

    if (day !== 1 || lastSentMonth === monthKey) return

    console.log('📧 Sending monthly adoption reminder emails...')

    try {
      const activeAdoptions = await peopleGroupAdoptionService.getAllActive()

      if (activeAdoptions.length === 0) {
        console.log('   No active adoptions found')
        lastSentMonth = monthKey
        return
      }

      // Group adoptions by group_id
      const adoptionsByGroup = new Map<number, typeof activeAdoptions>()
      for (const adoption of activeAdoptions) {
        const existing = adoptionsByGroup.get(adoption.group_id) || []
        existing.push(adoption)
        adoptionsByGroup.set(adoption.group_id, existing)
      }

      const config = useRuntimeConfig()
      const baseUrl = config.public.siteUrl || 'http://localhost:3000'
      let sent = 0
      let skipped = 0

      for (const [groupId, adoptions] of adoptionsByGroup) {
        const group = await groupService.getById(groupId)
        if (!group || !group.primary_subscriber_id) {
          skipped++
          continue
        }

        const subscriber = await subscriberService.getSubscriberById(group.primary_subscriber_id)
        if (!subscriber) {
          skipped++
          continue
        }

        const primaryEmail = await contactMethodService.getPrimaryEmail(subscriber.id)
        if (!primaryEmail) {
          skipped++
          continue
        }

        const success = await sendAdoptionReminderEmail({
          to: primaryEmail.value,
          contactName: subscriber.name,
          groupName: group.name,
          adoptions: adoptions.map(a => ({
            peopleGroupName: a.people_group_name,
            updateUrl: `${baseUrl}/adoption/update/${a.update_token}`
          }))
        })

        if (success) sent++
        else skipped++
      }

      lastSentMonth = monthKey
      console.log(`✅ Adoption reminders sent: ${sent} emails, ${skipped} skipped`)
    } catch (error: any) {
      console.error('❌ Adoption reminder error:', error.message)
    }
  }, 60 * 60 * 1000) // Check every hour

  console.log('✅ Adoption reminder scheduler initialized')

  nitroApp.hooks.hook('close', () => {
    console.log('🛑 Stopping adoption reminder scheduler...')
    clearInterval(interval)
  })
})
