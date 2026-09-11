// Single source of truth for the reasons a subscriber can give when they mute or
// stop a prayer time. Used by the self-service opt-out pages, the API that records
// the answer, and the admin dashboard breakdown.
//
// Only the key is ever stored. The wording people read lives in the i18n locale
// files under `optOutReason.<key>`, so adding a reason or rewording one is a code
// change and never a migration or a data backfill.

export type OptOutReasonKey =
  | 'wrong_time'
  | 'life_busy'
  | 'no_longer_praying'
  | 'different_people_group'
  | 'emails_only'
  | 'other'

export interface OptOutReason {
  key: OptOutReasonKey
  // Answers already implied by a button that says the person stopped praying.
  // Offering them again asks something the click already settled, or contradicts it.
  impliedByStopping?: boolean
  // Reveals the free-text box instead of standing on its own.
  freeText?: boolean
}

export const OPT_OUT_REASONS: OptOutReason[] = [
  { key: 'wrong_time' },
  { key: 'life_busy' },
  { key: 'no_longer_praying', impliedByStopping: true },
  { key: 'different_people_group' },
  { key: 'emails_only', impliedByStopping: true },
  { key: 'other', freeText: true }
]

export const OPT_OUT_REASON_KEYS: OptOutReasonKey[] = OPT_OUT_REASONS.map(r => r.key)

// Recorded without asking when someone mutes: the mute button itself says they
// are still praying and only want the email to stop, which is this answer verbatim.
export const MUTE_OPT_OUT_REASON: OptOutReasonKey = 'emails_only'

// Longest free-text answer accepted, in characters. Roughly two sentences — long
// enough for a real answer, short enough to read at a glance in the admin panel.
export const OPT_OUT_REASON_TEXT_MAX = 300

/**
 * Which reasons to offer after a given opt-out.
 *
 * `alreadySaidStopped` is true when the button the person clicked already stated
 * they are no longer praying ("Not praying any more", or the follow-up email's
 * "I'm not praying"). Those answers are dropped: one repeats what the click said,
 * the other contradicts it.
 */
export function optOutReasonsFor(alreadySaidStopped: boolean): OptOutReasonKey[] {
  return OPT_OUT_REASONS
    .filter(r => !(alreadySaidStopped && r.impliedByStopping))
    .map(r => r.key)
}

export function isOptOutReasonKey(value: unknown): value is OptOutReasonKey {
  return typeof value === 'string' && OPT_OUT_REASON_KEYS.includes(value as OptOutReasonKey)
}
