import { peopleGroupReportService, type ReportType } from '../../database/people-group-reports'
import { peopleGroupService } from '../../database/people-groups'
import { contactMethodService } from '../../database/contact-methods'
import { verifyTurnstile } from '../../utils/app/turnstile'
import { isSuggestionImageKey } from '../../utils/app/suggestion-images'
import { sendReportVerificationEmail, notifyReportApprovers } from '../../utils/app/report-emails'
import { checkRateLimit, logRateLimitExceeded } from '../../utils/rate-limit'
import { logEvent } from '../../utils/activity-logger'
import { publicSuggestibleFieldKeys, getField } from '~/utils/people-group-fields'

const RATE_WINDOW_MS = 60 * 60 * 1000
const RATE_MAX = 10

// Keys the public form may suggest, by report type. Add carries external
// identifiers from the picker; remove carries the archive reason.
const ALLOWED_KEYS: Record<ReportType, Set<string>> = {
  update: new Set<string>(publicSuggestibleFieldKeys),
  add: new Set<string>([...publicSuggestibleFieldKeys, 'imb_peid', 'imb_pgid', 'joshua_project_id']),
  remove: new Set<string>([...publicSuggestibleFieldKeys, 'reason_unlisted'])
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * POST /api/updates
 * Public submission of a people group suggestion (add / update / remove).
 * Held as awaiting_verification until the reporter's email is verified, then
 * reviewed by the two designated approvers.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, any>>(event)

  const type = body.type as ReportType
  if (!['add', 'update', 'remove'].includes(type)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid suggestion type' })
  }

  const reporterName = String(body.reporter_name || '').trim()
  const reporterEmail = String(body.reporter_email || '').trim().toLowerCase()
  if (!reporterName) {
    throw createError({ statusCode: 400, statusMessage: 'Your name is required' })
  }
  if (!EMAIL_RE.test(reporterEmail)) {
    throw createError({ statusCode: 400, statusMessage: 'A valid email address is required' })
  }

  // Every change needs a second, independent person with firsthand knowledge
  // who can substantiate it — someone other than the submitter.
  const verifierName = String(body.verifier_name || '').trim()
  const verifierEmail = String(body.verifier_email || '').trim().toLowerCase()
  if (!verifierName) {
    throw createError({ statusCode: 400, statusMessage: 'A verifier name is required' })
  }
  if (!EMAIL_RE.test(verifierEmail)) {
    throw createError({ statusCode: 400, statusMessage: 'A valid verifier email address is required' })
  }
  if (verifierEmail === reporterEmail) {
    throw createError({ statusCode: 400, statusMessage: 'The verifier must be someone other than you' })
  }

  if (!(await verifyTurnstile(event, body.turnstile_token))) {
    throw createError({ statusCode: 400, statusMessage: 'Anti-spam verification failed. Please try again.' })
  }

  const userAgent = getHeader(event, 'user-agent') || undefined
  const ip = getHeader(event, 'cf-connecting-ip')
    || getHeader(event, 'x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown'
  const rateCheck = await checkRateLimit('PG_SUGGESTION_SUBMIT', 'ip', ip, RATE_WINDOW_MS, RATE_MAX)
  if (!rateCheck.allowed) {
    logRateLimitExceeded(ip, '/api/updates', userAgent)
    setResponseHeader(event, 'Retry-After', rateCheck.retryAfterSeconds!)
    throw createError({ statusCode: 429, statusMessage: 'Too many submissions. Please try again later.' })
  }
  await logEvent({ eventType: 'PG_SUGGESTION_SUBMIT', userAgent, metadata: { ip } })

  // Whitelist + light type validation of the suggested values.
  const allowed = ALLOWED_KEYS[type]
  const suggestedChanges: Record<string, any> = {}
  const rawChanges = (body.suggested_changes || {}) as Record<string, any>
  for (const [key, value] of Object.entries(rawChanges)) {
    if (!allowed.has(key)) continue
    if (value === undefined || value === null || value === '') continue
    const field = getField(key)
    if (field?.type === 'boolean') {
      if (value === true || value === 'true') suggestedChanges[key] = true
      else if (value === false || value === 'false') suggestedChanges[key] = false
      continue
    }
    if (field?.type === 'number') {
      const n = Number(value)
      if (!Number.isFinite(n)) continue
      suggestedChanges[key] = n
    } else if (field?.type === 'select' && field.options && !field.optionsSource) {
      if (!field.options.some((o) => o.value === String(value))) continue
      suggestedChanges[key] = String(value)
    } else {
      suggestedChanges[key] = String(value).slice(0, 5000)
    }
  }

  const notes = body.comments ? String(body.comments).slice(0, 10000) : null

  let peopleGroupId: number | null = null
  if (type === 'update' || type === 'remove') {
    peopleGroupId = Number(body.people_group_id)
    if (!Number.isInteger(peopleGroupId)) {
      throw createError({ statusCode: 400, statusMessage: 'Select a people group' })
    }
    const group = await peopleGroupService.getPeopleGroupById(peopleGroupId)
    if (!group) {
      throw createError({ statusCode: 404, statusMessage: 'People group not found' })
    }
  }

  // Only keys minted by /api/updates/upload-image are accepted — the apply
  // step reads this key from the private bucket, so it must never point
  // outside the suggestion prefix.
  const suggestedImageKey = body.suggested_image_key ? String(body.suggested_image_key) : null
  if (suggestedImageKey && !isSuggestionImageKey(suggestedImageKey)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid image key' })
  }

  if (type === 'add' && !suggestedChanges.name) {
    throw createError({ statusCode: 400, statusMessage: 'The people group name is required' })
  }
  // The DOXA list only covers unengaged people groups — an engaged group is
  // outside its scope, so a new-group submission for one is not accepted.
  if (type === 'add' && suggestedChanges.engagement_status === 'engaged') {
    throw createError({ statusCode: 400, statusMessage: 'Engaged people groups are outside the scope of the DOXA list' })
  }
  if (type === 'update' && Object.keys(suggestedChanges).length === 0 && !suggestedImageKey && !notes) {
    throw createError({ statusCode: 400, statusMessage: 'Suggest at least one change or add a comment' })
  }
  if (type === 'remove' && !suggestedChanges.reason_unlisted) {
    throw createError({ statusCode: 400, statusMessage: 'Select a reason for removal' })
  }
  // Adding or removing a group is a bigger ask than a field tweak — reviewers
  // need the submitter's context.
  if ((type === 'add' || type === 'remove') && !notes) {
    throw createError({ statusCode: 400, statusMessage: 'Please add a comment explaining your request' })
  }

  const contactMethod = await contactMethodService.ensureEmailRegistryRow(reporterEmail)
  const verified = contactMethod.verified

  const report = await peopleGroupReportService.create({
    people_group_id: peopleGroupId,
    people_group_name: type === 'add' ? (suggestedChanges.name as string) : null,
    type,
    source: 'public',
    status: verified ? 'pending' : 'awaiting_verification',
    reporter_name: reporterName.slice(0, 200),
    reporter_email: reporterEmail,
    reporter_org: body.reporter_org ? String(body.reporter_org).slice(0, 200) : null,
    verifier_name: verifierName.slice(0, 200),
    verifier_entity: body.verifier_entity ? String(body.verifier_entity).slice(0, 200) : null,
    verifier_email: verifierEmail.slice(0, 200),
    reporter_contact_method_id: contactMethod.id,
    suggested_changes: suggestedChanges,
    suggested_image_key: suggestedImageKey,
    notes
  })

  if (verified) {
    const withDetails = await peopleGroupReportService.getById(report.id)
    notifyReportApprovers(withDetails || report).catch((err) =>
      console.error('Failed to notify report approvers:', err)
    )
    return { id: report.id, status: report.status }
  }

  // Reuses the shared per-address token: earlier links keep working, and the
  // cooldown stops a submit loop from flooding the inbox.
  const { token } = await contactMethodService.generateVerificationToken(contactMethod.id)
  const { allowed: sendAllowed } = await contactMethodService.claimVerificationSend(contactMethod.id, 60)
  if (sendAllowed) {
    await sendReportVerificationEmail(reporterEmail, token)
  }

  return { id: report.id, status: report.status }
})
