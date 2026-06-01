import type { Sql, Fragment } from 'postgres'
import type { Operator } from '#shared/crm/filter-types'
import {
  arrayEnumColumn,
  dateColumn,
  enumColumn,
  textColumn,
  type ServerManifest,
} from '../filter-sql'

// All field defs assume the main query aliases `subscribers` as `s`.
export const subscriberServerManifest: ServerManifest = {
  name: { type: 'text', buildSql: textColumn('s.name') },
  role: { type: 'text', buildSql: textColumn('s.role') },
  preferred_language: { type: 'enum', buildSql: enumColumn('s.preferred_language') },
  country: { type: 'enum', buildSql: enumColumn('s.country') },
  sources: { type: 'enum-multi', buildSql: arrayEnumColumn('s.sources') },
  created_at: { type: 'date', buildSql: dateColumn('s.created_at') },

  email_verified: {
    type: 'boolean',
    buildSql: (op: Operator, _value: unknown, sql: Sql): Fragment | null => {
      if (op === 'is_true') {
        return sql`EXISTS (
          SELECT 1 FROM contact_methods cm
          WHERE cm.subscriber_id = s.id AND cm.type = 'email' AND cm.verified = TRUE
        )`
      }
      if (op === 'is_false') {
        return sql`NOT EXISTS (
          SELECT 1 FROM contact_methods cm
          WHERE cm.subscriber_id = s.id AND cm.type = 'email' AND cm.verified = TRUE
        )`
      }
      return null
    },
  },

  doxa_general_consent: {
    type: 'boolean',
    buildSql: (op: Operator, _value: unknown, sql: Sql): Fragment | null => {
      if (op === 'is_true') {
        return sql`EXISTS (
          SELECT 1 FROM contact_methods cm
          WHERE cm.subscriber_id = s.id AND cm.type = 'email' AND cm.consent_doxa_general = TRUE
        )`
      }
      if (op === 'is_false') {
        return sql`NOT EXISTS (
          SELECT 1 FROM contact_methods cm
          WHERE cm.subscriber_id = s.id AND cm.type = 'email' AND cm.consent_doxa_general = TRUE
        )`
      }
      return null
    },
  },

  subscribed_to_people_group: {
    type: 'foreign-key',
    buildSql: (op: Operator, value: unknown, sql: Sql): Fragment | null => {
      const id = Number(value)
      if (!Number.isFinite(id) || id <= 0) return null
      if (op === 'is') {
        return sql`EXISTS (
          SELECT 1 FROM campaign_subscriptions cs
          WHERE cs.subscriber_id = s.id AND cs.people_group_id = ${id}
        )`
      }
      if (op === 'is_not') {
        return sql`NOT EXISTS (
          SELECT 1 FROM campaign_subscriptions cs
          WHERE cs.subscriber_id = s.id AND cs.people_group_id = ${id}
        )`
      }
      return null
    },
  },
}
