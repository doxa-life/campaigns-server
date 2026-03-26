export type FieldType = 'text' | 'email' | 'tel' | 'number' | 'time' | 'select' | 'boolean' | 'textarea'

export interface SubscriberFieldDefinition {
  key: string
  label: string
  type: FieldType
  description?: string
  readOnly?: boolean
  category: 'contact' | 'subscription' | 'consent' | 'form'
}

// Contact information fields
export const subscriberFields: SubscriberFieldDefinition[] = [
  // Contact fields (editable on the subscriber record)
  { key: 'name', label: 'Name', type: 'text', category: 'contact', description: 'Full name of the subscriber' },
  { key: 'email', label: 'Email', type: 'email', category: 'contact', description: 'Primary email address' },
  { key: 'phone', label: 'Phone', type: 'tel', category: 'contact', description: 'Phone number for WhatsApp delivery' },
  { key: 'role', label: 'Role', type: 'text', category: 'contact', description: 'Role within their church or organization' },
  { key: 'preferred_language', label: 'Preferred Language', type: 'select', category: 'contact', description: 'Language for prayer content and emails' },

  // Subscription fields
  { key: 'delivery_method', label: 'Delivery Method', type: 'select', category: 'subscription', description: 'How reminders are delivered (email, WhatsApp, app)' },
  { key: 'frequency', label: 'Frequency', type: 'select', category: 'subscription', description: 'How often reminders are sent' },
  { key: 'days_of_week', label: 'Days of Week', type: 'text', category: 'subscription', readOnly: true, description: 'Which days reminders are sent for weekly frequency' },
  { key: 'time_preference', label: 'Time Preference', type: 'time', category: 'subscription', description: 'Preferred time of day for reminders' },
  { key: 'timezone', label: 'Timezone', type: 'text', category: 'subscription', readOnly: true, description: 'Subscriber timezone for scheduling reminders' },
  { key: 'prayer_duration', label: 'Prayer Duration', type: 'number', category: 'subscription', readOnly: true, description: 'Committed prayer time in minutes' },
  { key: 'next_reminder_utc', label: 'Next Reminder', type: 'text', category: 'subscription', readOnly: true, description: 'When the next reminder email will be sent' },
  { key: 'status', label: 'Status', type: 'select', category: 'subscription', description: 'Subscription status (active, pending, inactive, unsubscribed)' },

  // Consent fields
  { key: 'people_group_updates', label: 'People Group Updates', type: 'boolean', category: 'consent', description: 'Consent to receive marketing updates about their adopted people group' },
  { key: 'doxa_general_updates', label: 'Doxa General Updates', type: 'boolean', category: 'consent', description: 'Consent to receive general Doxa marketing communications' },

  // Form-only fields (used in activity logs from signup/adoption/contact forms)
  { key: 'language', label: 'Language', type: 'select', category: 'form', description: 'Language selected on the signup form' },
  { key: 'reminder_time', label: 'Reminder Time', type: 'time', category: 'form', description: 'Reminder time selected on the signup form' },
  { key: 'people_group', label: 'People Group', type: 'text', category: 'form', description: 'People group name from the adoption form' },
  { key: 'church', label: 'Church', type: 'text', category: 'form', description: 'Church or organization name' },
  { key: 'country', label: 'Country', type: 'select', category: 'form', description: 'Country of the subscriber' },
  { key: 'public_display', label: 'Public Display', type: 'boolean', category: 'form', description: 'Whether adoption is shown publicly' },
  { key: 'permission_to_contact', label: 'Permission to Contact', type: 'boolean', category: 'form', description: 'Whether Doxa may contact this person' },
  { key: 'message', label: 'Message', type: 'text', category: 'form', description: 'Message from the contact form' },
]

const fieldMap = new Map(subscriberFields.map(f => [f.key, f]))

export function getSubscriberField(key: string): SubscriberFieldDefinition | undefined {
  return fieldMap.get(key)
}

export function getSubscriberFieldLabel(key: string): string {
  return fieldMap.get(key)?.label || key
}

export function getSubscriberFieldsByCategory(category: SubscriberFieldDefinition['category']): SubscriberFieldDefinition[] {
  return subscriberFields.filter(f => f.category === category)
}
