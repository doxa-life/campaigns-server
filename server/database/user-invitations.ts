import { getSql } from './db'
import { v4 as uuidv4 } from 'uuid'
import type { RoleName } from './roles'

export interface UserInvitation {
  id: number
  email: string
  token: string
  invited_by: string
  roles: RoleName[]
  status: 'pending' | 'accepted' | 'expired' | 'revoked'
  expires_at: string
  accepted_at: string | null
  created_at: string
  updated_at: string
}

export interface UserInvitationWithInviter extends UserInvitation {
  inviter_name: string
  inviter_email: string
}

export interface CreateInvitationData {
  email: string
  invited_by: string
  roles?: RoleName[]
  expires_in_days?: number
}

export class UserInvitationService {
  private sql = getSql()

  async createInvitation(data: CreateInvitationData): Promise<UserInvitation> {
    const { email, invited_by, roles = [], expires_in_days = 7 } = data

    const token = uuidv4()

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + expires_in_days)

    try {
      const [row] = await this.sql`
        INSERT INTO user_invitations (email, token, invited_by, roles, expires_at)
        VALUES (${email}, ${token}, ${invited_by}, ${roles}, ${expiresAt.toISOString()})
        RETURNING *
      `
      return row as UserInvitation
    } catch (error: any) {
      if (error.code === '23505') {
        throw new Error('An invitation for this email already exists')
      }
      throw error
    }
  }

  async getInvitationById(id: number): Promise<UserInvitation | null> {
    const [row] = await this.sql`SELECT * FROM user_invitations WHERE id = ${id}`
    return (row as UserInvitation) || null
  }

  async getInvitationByToken(token: string): Promise<UserInvitation | null> {
    const [row] = await this.sql`SELECT * FROM user_invitations WHERE token = ${token}`
    return (row as UserInvitation) || null
  }

  async getAllInvitationsWithInviter(): Promise<UserInvitationWithInviter[]> {
    return await this.sql`
      SELECT ui.*, u.display_name as inviter_name, u.email as inviter_email
      FROM user_invitations ui
      LEFT JOIN users u ON ui.invited_by = u.id
      ORDER BY ui.created_at DESC
    `
  }

  async getPendingInvitations(): Promise<UserInvitationWithInviter[]> {
    return await this.sql`
      SELECT ui.*, u.display_name as inviter_name, u.email as inviter_email
      FROM user_invitations ui
      LEFT JOIN users u ON ui.invited_by = u.id
      WHERE ui.status = 'pending'
        AND ui.expires_at > CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      ORDER BY ui.created_at DESC
    `
  }

  async validateInvitation(token: string): Promise<{ valid: boolean; invitation?: UserInvitation; reason?: string }> {
    const invitation = await this.getInvitationByToken(token)

    if (!invitation) return { valid: false, reason: 'Invalid invitation token' }

    if (invitation.status !== 'pending') {
      return { valid: false, reason: `Invitation has been ${invitation.status}`, invitation }
    }

    const now = new Date()
    const expiresAt = new Date(invitation.expires_at)

    if (now > expiresAt) {
      await this.updateInvitationStatus(invitation.id, 'expired')
      return { valid: false, reason: 'Invitation has expired', invitation }
    }

    return { valid: true, invitation }
  }

  async updateInvitationStatus(
    id: number,
    status: 'pending' | 'accepted' | 'expired' | 'revoked',
    accepted_at?: string
  ): Promise<boolean> {
    if (status === 'accepted' && accepted_at) {
      const result = await this.sql`
        UPDATE user_invitations
        SET status = ${status}, accepted_at = ${accepted_at}, updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
        WHERE id = ${id}
      `
      return result.count > 0
    }
    const result = await this.sql`
      UPDATE user_invitations
      SET status = ${status}, updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ${id}
    `
    return result.count > 0
  }

  async acceptInvitation(id: number): Promise<boolean> {
    return this.updateInvitationStatus(id, 'accepted', new Date().toISOString())
  }

  async revokeInvitation(id: number): Promise<boolean> {
    return this.updateInvitationStatus(id, 'revoked')
  }

  async deleteInvitation(id: number): Promise<boolean> {
    const result = await this.sql`DELETE FROM user_invitations WHERE id = ${id}`
    return result.count > 0
  }

  async hasPendingInvitation(email: string): Promise<boolean> {
    const [result] = await this.sql`
      SELECT COUNT(*) as count FROM user_invitations
      WHERE email = ${email} AND status = 'pending'
        AND expires_at > CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
    `
    return result?.count > 0
  }

  async cleanupExpiredInvitations(): Promise<number> {
    const result = await this.sql`
      UPDATE user_invitations
      SET status = 'expired', updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE status = 'pending'
        AND expires_at < CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
    `
    return result.count
  }
}

export const userInvitationService = new UserInvitationService()
