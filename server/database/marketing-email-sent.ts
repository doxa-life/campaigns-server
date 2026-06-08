import { getSql } from './db'

/**
 * Records a marketing send as a single activity_logs row that does double duty:
 *  - Idempotency: a deterministic id (md5 of campaign + recipient) + ON CONFLICT (id)
 *    DO NOTHING makes the insert an atomic per-recipient claim, so a requeued job (reaper
 *    after a crash/redeploy, or a retry) never re-sends to someone already mailed. Same
 *    primitive as claimLock in activity-email-scheduler.ts.
 *  - Timeline: the same row carries table_name='subscribers' / record_id=subscriberId,
 *    so the send shows on the contact's CRM Activity tab.
 *
 * The processor claims before handing the message to the email provider (the claim
 * survives a crash → the requeue skips) and releases only on a returned failure (so
 * genuine retries re-send).
 */

const SENT_EVENT = 'MARKETING_EMAIL_SENT'

function claimKey(marketingEmailId: number, recipientEmail: string): string {
  return `marketing-email-sent:${marketingEmailId}:${recipientEmail.toLowerCase()}`
}

interface ClaimParams {
  marketingEmailId: number
  contactMethodId: number
  recipientEmail: string
  subscriberId?: number | null
  subject: string
}

class MarketingEmailSentService {
  private sql = getSql()

  /**
   * Claim a recipient for a campaign. Returns true if this call won the claim (proceed to
   * send), false if already claimed/sent (skip). Keyed on the lowercased recipient email,
   * NOT contact_method_id, because the admins/test audience enqueues every recipient with
   * contact_method_id = 0.
   */
  async claim(params: ClaimParams): Promise<boolean> {
    const key = claimKey(params.marketingEmailId, params.recipientEmail)
    const [row] = await this.sql`
      INSERT INTO activity_logs (id, timestamp, event_type, table_name, record_id, metadata)
      VALUES (
        md5(${key})::uuid,
        ${Date.now()},
        ${SENT_EVENT},
        ${params.subscriberId ? 'subscribers' : null},
        ${params.subscriberId ? String(params.subscriberId) : null},
        ${this.sql.json({
          marketing_email_id: params.marketingEmailId,
          contact_method_id: params.contactMethodId,
          recipient_email: params.recipientEmail,
          subject: params.subject
        })}
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `
    return !!row
  }

  /**
   * Release a claim after a returned send failure so the queue's retry can re-attempt.
   * Deliberately NOT called on a crash/throw mid-send: leaving the claim in place is what
   * makes the reaper's requeue safe (it skips instead of re-sending).
   */
  async release(marketingEmailId: number, recipientEmail: string): Promise<void> {
    const key = claimKey(marketingEmailId, recipientEmail)
    await this.sql`DELETE FROM activity_logs WHERE id = md5(${key})::uuid`
  }
}

export const marketingEmailSentService = new MarketingEmailSentService()
