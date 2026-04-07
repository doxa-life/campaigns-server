import { getAnthropicClient } from '../anthropic'

export interface ParsedReportResult {
  people_group_name: string | null
  people_group_uid: string | null
  reporter_name: string | null
  reporter_email: string | null
  suggested_changes: Record<string, any>
  notes: string | null
}

const SYSTEM_PROMPT = `You are a data extraction assistant for a people group database. You will receive a pasted field report about a people group and must extract structured data from it.

Return ONLY valid JSON matching this exact structure (no markdown, no code fences):
{
  "people_group_name": string or null,
  "people_group_uid": string or null,
  "reporter_name": string or null,
  "reporter_email": string or null,
  "suggested_changes": { ... },
  "notes": string or null
}

## Extraction Rules

1. **people_group_name**: The name of the people group mentioned in the report.
2. **people_group_uid**: Any Master UID, ROP3_PEID, or similar identifier found in the report.
3. **reporter_name**: The name of the person submitting/reporting. Combine first and last name if separate.
4. **reporter_email**: The email of the reporter if present.
5. **suggested_changes**: Map report information to these field keys. Only include fields where the report provides clear information.
6. **notes**: Any important information from the report that doesn't fit into the fields above. Include context about engagement, missionaries, or other qualitative details.

## Available Fields for suggested_changes

- **engagement_status** (select): Whether cross-cultural workers are engaged with this people group.
  Valid values: "engaged", "unengaged"
  If the report indicates ANY form of active engagement (workers, church planting, local church leadership, missionary activity), set to "engaged".

- **reason_engaged** (select): Why the group is considered engaged.
  Valid values: "imb_report", "agwm_report", "doxa_report"
  Use "doxa_report" when the engagement info comes from a field report submitted to Doxa.

- **believers_count** (number): Estimated number of believers among this people group.
  Must be a number or null.

- **population** (number): Total population of the people group.
  Must be a number or null.

- **workers_long_term** (boolean): Are cross-cultural workers LIVING and WORKING among the people group long-term?
  true = yes, they reside among the group. false = no resident workers.
  Note: Non-resident engagement (visiting, remote support) does NOT count as long-term presence.

- **work_in_local_language** (boolean): Are resident workers operating in the local language and culture?
  true/false. Only relevant if there ARE resident workers.

- **disciple_and_church_multiplication** (boolean): Is there evidence of disciple-making and church multiplication?
  true/false.

- **imb_congregation_existing** (select): Are there publicly-recognized congregations/churches?
  Valid values: "0" (No), "1" (Yes)
  If the report mentions a specific number of churches > 0, set to "1".

- **imb_church_planting** (select): Church planting status.
  Valid values: "0" (No churches planted), "1" (Dispersed church planting), "2" (Concentrated church planting)

## Important
- For boolean fields, use true/false (not strings).
- For select fields, use the exact string values specified.
- For number fields, use numbers (not strings).
- Only include a field in suggested_changes if the report provides clear evidence for it. Do not guess.
- Put qualitative details, missionary names, and contextual information in the notes field.`

export async function parseReportText(text: string): Promise<ParsedReportResult> {
  const client = getAnthropicClient()

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    temperature: 0,
    system: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: text }
    ]
  })

  const content = response.content[0]
  if (!content || content.type !== 'text') {
    throw new Error('Unexpected response type from AI')
  }

  const parsed = JSON.parse(content.text) as ParsedReportResult

  // Validate structure
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Invalid response structure from AI')
  }

  return {
    people_group_name: parsed.people_group_name ?? null,
    people_group_uid: parsed.people_group_uid ?? null,
    reporter_name: parsed.reporter_name ?? null,
    reporter_email: parsed.reporter_email ?? null,
    suggested_changes: parsed.suggested_changes ?? {},
    notes: parsed.notes ?? null
  }
}
