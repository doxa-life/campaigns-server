import { appConfigService } from '../../database/app-config'

const CONFIG_KEY = 'people_group_report_approvers'
const NOTIFY_EMAILS_KEY = 'people_group_report_notify_emails'

/**
 * The two designated users (DOXA + Gospel Access Coordinators) who review
 * public /updates submissions. Both must approve before a report can be
 * applied; either can deny.
 */
export async function getReportApprovers(): Promise<string[]> {
  const value = await appConfigService.getConfig<string[]>(CONFIG_KEY)
  return Array.isArray(value) ? value : []
}

export async function setReportApprovers(userIds: string[]): Promise<void> {
  await appConfigService.setConfig(CONFIG_KEY, userIds)
}

export async function isReportApprover(userId: string): Promise<boolean> {
  const approvers = await getReportApprovers()
  return approvers.includes(userId)
}

/**
 * Extra addresses, outside the approver pair, that are told when a public
 * suggestion has been applied. Empty when none are configured.
 */
export async function getReportNotifyEmails(): Promise<string[]> {
  const value = await appConfigService.getConfig<string[]>(NOTIFY_EMAILS_KEY)
  return Array.isArray(value) ? value.filter((v) => typeof v === 'string') : []
}

export async function setReportNotifyEmails(emails: string[]): Promise<void> {
  await appConfigService.setConfig(NOTIFY_EMAILS_KEY, emails)
}
