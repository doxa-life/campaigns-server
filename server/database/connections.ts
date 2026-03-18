import { getSql } from './db'

export interface Connection {
  id: number
  from_type: string
  from_id: number
  to_type: string
  to_id: number
  connection_type: string | null
  created_at: string
}

class ConnectionService {
  private sql = getSql()

  async create(data: {
    from_type: string
    from_id: number
    to_type: string
    to_id: number
    connection_type?: string | null
  }): Promise<Connection> {
    const [row] = await this.sql`
      INSERT INTO connections (from_type, from_id, to_type, to_id, connection_type)
      VALUES (${data.from_type}, ${data.from_id}, ${data.to_type}, ${data.to_id}, ${data.connection_type || null})
      RETURNING *
    `
    return row
  }

  async getById(id: number): Promise<Connection | null> {
    const [row] = await this.sql`SELECT * FROM connections WHERE id = ${id}`
    return row || null
  }

  async getConnections(type: string, id: number, targetType: string): Promise<Connection[]> {
    return await this.sql`
      SELECT * FROM connections
      WHERE (from_type = ${type} AND from_id = ${id} AND to_type = ${targetType})
         OR (to_type = ${type} AND to_id = ${id} AND from_type = ${targetType})
      ORDER BY created_at DESC
    `
  }

  async getSubscribersForGroup(groupId: number): Promise<{ subscriber_id: number; name: string; email: string | null; phone: string | null; role: string | null; connection_type: string | null }[]> {
    return await this.sql`
      SELECT s.id as subscriber_id, s.name, s.role,
        (SELECT cm.value FROM contact_methods cm WHERE cm.subscriber_id = s.id AND cm.type = 'email' ORDER BY cm.verified DESC, cm.created_at ASC LIMIT 1) as email,
        (SELECT cm.value FROM contact_methods cm WHERE cm.subscriber_id = s.id AND cm.type = 'phone' ORDER BY cm.verified DESC, cm.created_at ASC LIMIT 1) as phone,
        conn.connection_type
      FROM connections conn
      JOIN subscribers s ON s.id = conn.from_id
      WHERE conn.from_type = 'subscriber' AND conn.to_type = 'group' AND conn.to_id = ${groupId}
      ORDER BY s.name
    ` as any[]
  }

  async getGroupsForSubscriber(subscriberId: number): Promise<{ group_id: number; name: string; connection_type: string | null }[]> {
    return await this.sql`
      SELECT g.id as group_id, g.name, conn.connection_type
      FROM connections conn
      JOIN groups g ON g.id = conn.to_id
      WHERE conn.from_type = 'subscriber' AND conn.to_type = 'group' AND conn.from_id = ${subscriberId}
      ORDER BY g.name
    ` as any[]
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.sql`DELETE FROM connections WHERE id = ${id}`
    return result.count > 0
  }

  async deleteByEntities(fromType: string, fromId: number, toType: string, toId: number): Promise<boolean> {
    const result = await this.sql`
      DELETE FROM connections
      WHERE from_type = ${fromType} AND from_id = ${fromId} AND to_type = ${toType} AND to_id = ${toId}
    `
    return result.count > 0
  }

  async deleteForEntity(type: string, id: number): Promise<number> {
    const result = await this.sql`
      DELETE FROM connections
      WHERE (from_type = ${type} AND from_id = ${id}) OR (to_type = ${type} AND to_id = ${id})
    `
    return result.count
  }
}

export const connectionService = new ConnectionService()
