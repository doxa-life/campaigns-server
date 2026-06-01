import { getSql } from './db'

export interface PeopleGroupAccess {
  people_group_id: number
  user_id: string
  created_at: string
}

export class PeopleGroupAccessService {
  private sql = getSql()

  async assignUserToPeopleGroup(userId: string, peopleGroupId: number): Promise<void> {
    await this.sql`
      INSERT INTO campaign_users (user_id, people_group_id)
      VALUES (${userId}, ${peopleGroupId})
      ON CONFLICT DO NOTHING
    `
  }

  async removeUserFromPeopleGroup(userId: string, peopleGroupId: number): Promise<void> {
    await this.sql`DELETE FROM campaign_users WHERE user_id = ${userId} AND people_group_id = ${peopleGroupId}`
  }

  async userHasAccess(userId: string, peopleGroupId: number): Promise<boolean> {
    const [row] = await this.sql`
      SELECT 1 FROM campaign_users
      WHERE user_id = ${userId} AND people_group_id = ${peopleGroupId}
      LIMIT 1
    `
    return !!row
  }

  async getUserPeopleGroups(userId: string): Promise<number[]> {
    const results = await this.sql`
      SELECT people_group_id FROM campaign_users
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
    `
    return results.map((r: any) => r.people_group_id)
  }

  async getPeopleGroupUsers(peopleGroupId: number): Promise<string[]> {
    const results = await this.sql`
      SELECT user_id FROM campaign_users
      WHERE people_group_id = ${peopleGroupId}
      ORDER BY created_at DESC
    `
    return results.map((r: any) => r.user_id)
  }

  async assignUsersToPeopleGroup(userIds: string[], peopleGroupId: number): Promise<void> {
    for (const userId of userIds) {
      await this.assignUserToPeopleGroup(userId, peopleGroupId)
    }
  }

  async assignUserToPeopleGroups(userId: string, peopleGroupIds: number[]): Promise<void> {
    for (const peopleGroupId of peopleGroupIds) {
      await this.assignUserToPeopleGroup(userId, peopleGroupId)
    }
  }

  async removeAllUsersFromPeopleGroup(peopleGroupId: number): Promise<void> {
    await this.sql`DELETE FROM campaign_users WHERE people_group_id = ${peopleGroupId}`
  }

  async removeUserFromAllPeopleGroups(userId: string): Promise<void> {
    await this.sql`DELETE FROM campaign_users WHERE user_id = ${userId}`
  }

  async getUserPeopleGroupCount(userId: string): Promise<number> {
    const [result] = await this.sql`SELECT COUNT(*) as count FROM campaign_users WHERE user_id = ${userId}`
    return result?.count
  }

  async getPeopleGroupUserCount(peopleGroupId: number): Promise<number> {
    const [result] = await this.sql`SELECT COUNT(*) as count FROM campaign_users WHERE people_group_id = ${peopleGroupId}`
    return result?.count
  }
}

export const peopleGroupAccessService = new PeopleGroupAccessService()
