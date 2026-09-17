import { imbPeopleGroupService } from '../../database/imb-people-groups'
import type { PeopleGroupReportWithDetails } from '../../database/people-group-reports'
import { callAiTool, getAiModel, isAiConfigured, toAiHttpError, type AiTool } from '../ai'
import { getField } from '~/utils/people-group-fields'
import { getFieldOptionLabel } from './field-options'
import { findJoshuaProjectGroup } from './joshua-project'
import {
  countryDerivedFields,
  fieldsFromImbRow,
  optionKeyForValue,
  JOSHUA_PROJECT_CREDIT,
  type AddReportFields
} from './add-report-fields'

export interface AutoPopulateResult {
  fields: AddReportFields
  /** IMB detail metadata stored with the group but never shown as form inputs. */
  metadata: Record<string, any>
  /** The IMB mirror row, an AI classification, or only other groups in the same country. */
  source: 'imb' | 'ai' | 'country'
  warning?: string
}

// Select fields the AI may fill, each constrained to the registry's option codes.
const AI_SELECT_KEYS = [
  'primary_religion',
  'imb_reg_of_people_1',
  'doxa_wagf_region',
  'doxa_wagf_block',
  'region',
  'imb_subregion'
] as const

type AiFields = Partial<Record<(typeof AI_SELECT_KEYS)[number] | 'imb_alternate_name' | 'description_en', string>>

function optionCodes(fieldKey: string): string[] {
  return (getField(fieldKey)?.options ?? []).map((option) => option.value)
}

function optionLegend(fieldKey: string): string {
  return (getField(fieldKey)?.options ?? [])
    .map((option) => `${option.value}: ${getFieldOptionLabel(fieldKey, option.value, 'en') || option.value}`)
    .join('\n')
}

function systemPrompt(): string {
  return `You classify a people group for a prayer database. From the facts given, fill the requested fields using ONLY the codes listed below. Leave a field out when the evidence is not clear enough to choose one; never guess.

## Field guidance
- primary_religion: the code for the group's majority religion. A religion name from Joshua Project (for example "Islam") maps to the matching code; pick a specific branch only when the facts name it.
- imb_reg_of_people_1: the affinity bloc the people group belongs to, judged from its name, country, language and ethnicity.
- doxa_wagf_region and doxa_wagf_block: the World Assemblies of God Fellowship region and block of the group's country.
- region and imb_subregion: the UN M49 region and sub-region of the group's country.
- imb_alternate_name: other names the group is known by, comma separated, only when known.
- description_en: a short lowercase noun phrase completing "They are …", such as "a community of India" or "an indigenous Nuba Mountain people of Sudan". No trailing period.

## primary_religion codes
${optionLegend('primary_religion')}

## imb_reg_of_people_1 codes
${optionLegend('imb_reg_of_people_1')}

## doxa_wagf_region codes
${optionLegend('doxa_wagf_region')}

## doxa_wagf_block codes
${optionLegend('doxa_wagf_block')}

## region codes
${optionLegend('region')}

## imb_subregion codes
${optionLegend('imb_subregion')}`
}

function addFieldsTool(): AiTool {
  return {
    name: 'submit_people_group_fields',
    description: 'Submit the classified fields for the people group',
    parameters: {
      type: 'object',
      properties: {
        primary_religion: { type: 'string', enum: optionCodes('primary_religion') },
        imb_reg_of_people_1: { type: 'string', enum: optionCodes('imb_reg_of_people_1') },
        doxa_wagf_region: { type: 'string', enum: optionCodes('doxa_wagf_region') },
        doxa_wagf_block: { type: 'string', enum: optionCodes('doxa_wagf_block') },
        region: { type: 'string', enum: optionCodes('region') },
        imb_subregion: { type: 'string', enum: optionCodes('imb_subregion') },
        imb_alternate_name: { type: 'string', description: 'Other names for the group, comma separated' },
        description_en: { type: 'string', description: 'Noun phrase completing "They are …"' }
      },
      required: []
    }
  }
}

function compact<T extends Record<string, unknown>>(values: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== null && value !== undefined && value !== '')
  ) as Partial<T>
}

/**
 * Propose the add-report fields for an "add" report. An IMB-sourced report is
 * filled from the mirror row without AI; any other report gets the country's
 * shared values plus an AI classification of the remaining fields. Values the
 * report already carries are kept over anything inferred.
 */
export async function autoPopulateAddReport(report: PeopleGroupReportWithDetails): Promise<AutoPopulateResult> {
  const changes: Record<string, any> = report.suggested_changes || {}
  const countryCode = typeof changes.country_code === 'string' && changes.country_code ? changes.country_code : null
  const fromCountry = compact((await countryDerivedFields(countryCode)) ?? {})

  const peid = changes.imb_peid ? String(changes.imb_peid) : null
  const imbRow = peid ? await imbPeopleGroupService.getByPeid(peid) : null
  if (imbRow) {
    const mapped = fieldsFromImbRow(imbRow)
    return { fields: { ...fromCountry, ...compact(mapped.fields) }, metadata: mapped.metadata, source: 'imb' }
  }

  const known: AddReportFields = { ...fromCountry }
  const reportReligion = optionKeyForValue('primary_religion', changes.primary_religion)
  if (reportReligion) known.primary_religion = reportReligion
  const joshuaProjectPhoto = !report.suggested_image_key && /joshuaproject\.net/.test(String(changes.image_url || ''))
  if (joshuaProjectPhoto) known.picture_credit = JOSHUA_PROJECT_CREDIT

  if (!isAiConfigured()) {
    return {
      fields: known,
      metadata: {},
      source: 'country',
      warning: 'AI is not configured, so only values shared with other groups in the same country were filled.'
    }
  }

  const joshuaProject = changes.joshua_project_id
    ? await findJoshuaProjectGroup(String(changes.joshua_project_id), countryCode)
    : null
  const facts = compact({
    name: changes.name || report.people_group_name,
    country_code: countryCode,
    country: countryCode ? getFieldOptionLabel('country_code', countryCode, 'en') : null,
    population: changes.population,
    language_code: changes.primary_language,
    language: joshuaProject?.language_name,
    religion_per_joshua_project: joshuaProject?.religion,
    indigenous: changes.imb_is_indigenous === '1' ? 'indigenous' : changes.imb_is_indigenous === '0' ? 'diaspora' : null,
    engagement_status: changes.engagement_status,
    submitter_comments: report.notes
  })

  let parsed: Partial<AiFields>
  try {
    parsed = await callAiTool<AiFields>({
      model: await getAiModel(),
      system: [{ text: systemPrompt(), cache: true }],
      user: JSON.stringify(facts, null, 2),
      tool: addFieldsTool(),
      maxTokens: 1024,
      temperature: 0,
      label: 'Add report auto-populate'
    })
  } catch (error) {
    throw toAiHttpError(error, 'AI auto-populate call failed')
  }

  const inferred: AddReportFields = {}
  for (const key of AI_SELECT_KEYS) {
    const value = optionKeyForValue(key, parsed[key])
    if (value) inferred[key] = value
  }
  if (typeof parsed.imb_alternate_name === 'string' && parsed.imb_alternate_name.trim()) {
    inferred.imb_alternate_name = parsed.imb_alternate_name.trim()
  }
  if (typeof parsed.description_en === 'string' && parsed.description_en.trim()) {
    inferred.description_en = parsed.description_en.trim().replace(/\.$/, '')
  }

  return { fields: { ...inferred, ...known }, metadata: {}, source: 'ai' }
}
