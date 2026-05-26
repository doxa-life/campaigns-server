import { roleService } from '../database/roles'
import { userService, type User } from '../database/users'
import { verifyReplySig } from './inbox-addressing'

/**
 * Resolve a reply-by-email staff sender from a signed reply address.
 * Returns the matching user only if the signature is valid + unexpired AND the user
 * has `inbox.send`. We never trust the `From` header — we recompute the signature for
 * each send-capable user (a tiny set) and match. The caller must additionally require
 * the inbound message to be authenticated (DKIM) before treating it as a staff send.
 */
export async function resolveSignedStaffSender(opts: {
  conversationId: number
  exp: number | null
  sig: string | null
  secret: string
}): Promise<User | null> {
  if (!opts.sig || !opts.exp || !opts.secret) return null

  const roleNames = roleService.getRoleNamesWithPermission('inbox.send')
  const users = await userService.getUsersWithRoles(roleNames)

  for (const user of users) {
    const valid = verifyReplySig({
      secret: opts.secret,
      userId: user.id,
      conversationId: opts.conversationId,
      exp: opts.exp,
      candidateSig: opts.sig,
    })
    if (valid) return user
  }
  return null
}
