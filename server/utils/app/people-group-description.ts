import { getFieldOptionLabel, getTranslatedLabel } from './field-options'

interface PeopleGroupMetadata {
  imb_isoalpha3?: string
  imb_population?: number | string
  imb_engagement_status?: string
  imb_gsec?: string | number  // GSEC 0-3 = Unreached
  imb_is_indigenous?: string | number
  imb_alternate_name?: string
  imb_reg_of_people_1?: string  // ROP1 - Affinity Bloc
  imb_reg_of_people_2?: string  // ROP2 - People Cluster
  imb_reg_of_religion?: string
  imb_reg_of_religion_3?: string
  imb_reg_of_language?: string
  [key: string]: any
}

interface PeopleGroupData {
  name: string
  descriptions?: Record<string, string> | null
  metadata: PeopleGroupMetadata
}

/**
 * Gets a description template string and interpolates values into it.
 */
function getTemplate(key: string, locale: string, values: Record<string, string>): string {
  const template = getTranslatedLabel(`peopleGroups.descriptionTemplates.${key}`, locale)
  return template.replace(/\{(\w+)\}/g, (_, k) => values[k] || '')
}

/**
 * Generates a description for a people group using a template and field values.
 * Supports localization through the locale parameter.
 *
 * Template:
 * The {name} of {country}, numbering approximately {population} people, are {engagementStatus}.
 * They are {peopleDesc}.
 * They are an {indigenousStatus} people, in the {affinityBloc} affinity bloc.
 * Their primary religion is {religion}.
 * They primarily speak {language}.
 */
export function generatePeopleGroupDescription(peopleGroup: PeopleGroupData, locale: string = 'en'): string {
  const { name, descriptions, metadata } = peopleGroup
  // Get description for the requested locale, falling back to English
  const peopleDesc = descriptions?.[locale] || descriptions?.['en'] || null

  const parts: string[] = []

  // First sentence: name, country, population, engagement status
  const country = getFieldOptionLabel('imb_isoalpha3', metadata.imb_isoalpha3 || '', locale) || metadata.imb_isoalpha3
  const population = metadata.imb_population ? Number(metadata.imb_population).toLocaleString(locale) : null
  const engagementLabel = getFieldOptionLabel('imb_engagement_status', metadata.imb_engagement_status || '', locale) || metadata.imb_engagement_status

  // GSEC 0-3 = Unreached (< 2% evangelical)
  const gsecValue = metadata.imb_gsec !== undefined ? Number(metadata.imb_gsec) : null
  const isUnreached = gsecValue !== null && gsecValue <= 3

  // Combine engagement status with unreached status
  let engagementStatus = engagementLabel
  if (engagementStatus && isUnreached) {
    const isEngaged = metadata.imb_engagement_status === 'engaged'
    const unreachedKey = isEngaged ? 'butUnreached' : 'andUnreached'
    const unreachedSuffix = getTranslatedLabel(`peopleGroups.descriptionTemplates.${unreachedKey}`, locale)
    engagementStatus = `${engagementStatus} ${unreachedSuffix}`
  }

  if (country && population && engagementStatus) {
    parts.push(getTemplate('nameCountryPopulationEngagement', locale, { name, country, population, engagementStatus }))
  } else if (country && population) {
    parts.push(getTemplate('nameCountryPopulation', locale, { name, country, population }))
  } else if (population) {
    parts.push(getTemplate('namePopulation', locale, { name, population }))
  }

  // Second sentence: people description with alternate names
  if (peopleDesc) {
    const altNames = metadata.imb_alternate_name
    if (altNames) {
      parts.push(getTemplate('peopleDescWithAltNames', locale, { peopleDesc, altNames }))
    } else {
      parts.push(getTemplate('peopleDesc', locale, { peopleDesc }))
    }
  }

  // Third sentence: indigenous status, people cluster, and affinity bloc
  // imb_is_indigenous: "1" = Indigenous, "0" = Diaspora
  const indigenousRaw = metadata.imb_is_indigenous
  const isIndigenous = indigenousRaw === '1' || indigenousRaw === 1
  const isDiaspora = indigenousRaw === '0' || indigenousRaw === 0
  const peopleCluster = getFieldOptionLabel('imb_reg_of_people_2', metadata.imb_reg_of_people_2 || '', locale) || null
  const affinityBloc = getFieldOptionLabel('imb_reg_of_people_1', metadata.imb_reg_of_people_1 || '', locale) || null

  if ((isIndigenous || isDiaspora) && peopleCluster && affinityBloc) {
    const templateKey = isIndigenous ? 'indigenousClusterBloc' : 'diasporaClusterBloc'
    parts.push(getTemplate(templateKey, locale, { cluster: peopleCluster, bloc: affinityBloc }))
  } else if ((isIndigenous || isDiaspora) && affinityBloc) {
    const templateKey = isIndigenous ? 'indigenousBloc' : 'diasporaBloc'
    parts.push(getTemplate(templateKey, locale, { bloc: affinityBloc }))
  } else if (isIndigenous || isDiaspora) {
    const templateKey = isIndigenous ? 'indigenousOnly' : 'diasporaOnly'
    parts.push(getTemplate(templateKey, locale, {}))
  } else if (affinityBloc) {
    parts.push(getTemplate('blocOnly', locale, { bloc: affinityBloc }))
  }

  // Fourth sentence: religion
  const religion = getFieldOptionLabel('imb_reg_of_religion', metadata.imb_reg_of_religion || '', locale)
    || getFieldOptionLabel('imb_reg_of_religion_3', metadata.imb_reg_of_religion_3 || '', locale)
    || metadata.imb_reg_of_religion
  if (religion) {
    parts.push(getTemplate('religion', locale, { religion }))
  }

  // Fifth sentence: language (skip if undetermined)
  const languageCode = metadata.imb_reg_of_language || ''
  if (languageCode !== 'und') {
    const language = getFieldOptionLabel('imb_reg_of_language', languageCode, locale) || languageCode
    if (language) {
      parts.push(getTemplate('language', locale, { language }))
    }
  }

  return parts.join(' ')
}
