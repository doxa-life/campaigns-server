import { getAnthropicClient } from '../anthropic'

export interface ParsedReportResult {
  people_group_name: string | null
  people_group_uid: string | null
  reporter_name: string | null
  reporter_email: string | null
  suggested_changes: Record<string, any>
  notes: string | null
}

const SYSTEM_PROMPT = `You are a data extraction assistant for a people group database. You will receive a pasted field report about a people group and must extract structured data using the provided tool.

## Extraction Rules

1. **people_group_name**: The name of the people group mentioned in the report.
2. **people_group_uid**: Any Master UID, ROP3_PEID, or similar identifier found in the report.
3. **reporter_name**: The name of the person submitting/reporting. Combine first and last name if separate.
4. **reporter_email**: The email of the reporter if present.
5. **suggested_changes**: Map report information to the available field keys. Only include fields where the report provides clear evidence.
6. **notes**: Any important information from the report that doesn't fit into the fields above. Include context about engagement, missionaries, or other qualitative details.

## Field Guidance

- **engagement_status**: If the report indicates ANY form of active engagement (workers, church planting, local church leadership, missionary activity), set to "engaged".
- **reason_engaged**: Use "doxa_report" when the engagement info comes from a field report submitted to Doxa.
- **workers_long_term**: Only true if cross-cultural workers are LIVING and WORKING among the people group long-term. Non-resident engagement (visiting, remote support) does NOT count.
- **work_in_local_language**: Only relevant if there ARE resident workers.
- **imb_congregation_existing**: If the report mentions a specific number of churches > 0, set to "1".

## Important
- Only include a field in suggested_changes if the report provides clear evidence for it. Do not guess.
- Put qualitative details, missionary names, and contextual information in the notes field.`

const REPORT_TOOL = {
  name: 'submit_parsed_report',
  description: 'Submit the extracted report data',
  input_schema: {
    type: 'object' as const,
    properties: {
      people_group_name: { type: ['string', 'null'] as const, description: 'Name of the people group' },
      people_group_uid: { type: ['string', 'null'] as const, description: 'Master UID, ROP3_PEID, or similar identifier' },
      reporter_name: { type: ['string', 'null'] as const, description: 'Name of the person submitting the report' },
      reporter_email: { type: ['string', 'null'] as const, description: 'Email of the reporter' },
      suggested_changes: {
        type: 'object' as const,
        description: 'Field updates extracted from the report',
        properties: {
          engagement_status: { type: 'string' as const, enum: ['engaged', 'unengaged'] },
          reason_engaged: { type: 'string' as const, enum: ['imb_report', 'agwm_report', 'doxa_report'] },
          believers_count: { type: 'number' as const, description: 'Estimated number of believers' },
          population: { type: 'number' as const, description: 'Total population' },
          workers_long_term: { type: 'boolean' as const, description: 'Cross-cultural workers living among the group long-term' },
          work_in_local_language: { type: 'boolean' as const, description: 'Workers operating in local language and culture' },
          disciple_and_church_multiplication: { type: 'boolean' as const, description: 'Evidence of disciple-making and church multiplication' },
          imb_congregation_existing: { type: 'string' as const, enum: ['0', '1'], description: '0 = No congregations, 1 = Yes' },
          imb_church_planting: { type: 'string' as const, enum: ['0', '1', '2'], description: '0 = None, 1 = Dispersed, 2 = Concentrated' },
        },
      },
      notes: { type: ['string', 'null'] as const, description: 'Qualitative details, missionary names, and contextual information' },
    },
    required: ['people_group_name', 'suggested_changes'],
  },
}

export async function parseReportText(text: string): Promise<ParsedReportResult> {
  const client = getAnthropicClient()

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    temperature: 0,
    system: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: text }
    ],
    tools: [REPORT_TOOL],
    tool_choice: { type: 'tool', name: 'submit_parsed_report' }
  })

  const toolBlock = response.content.find(b => b.type === 'tool_use')
  if (!toolBlock || toolBlock.type !== 'tool_use') {
    throw new Error('Unexpected response from AI — no tool use block')
  }

  const parsed = toolBlock.input as ParsedReportResult

  return {
    people_group_name: parsed.people_group_name ?? null,
    people_group_uid: parsed.people_group_uid ?? null,
    reporter_name: parsed.reporter_name ?? null,
    reporter_email: parsed.reporter_email ?? null,
    suggested_changes: parsed.suggested_changes ?? {},
    notes: parsed.notes ?? null
  }
}
