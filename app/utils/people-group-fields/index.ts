import type { FieldDefinition, FieldCategory, FieldOption } from './types'
export type { FieldDefinition, FieldCategory, FieldOption, FieldType } from './types'
export { categories } from './types'

// Basic info fields
import { field as name } from './fields/name'
import { field as imbDisplayName } from './fields/imb-display-name'
import { field as imbAlternateName } from './fields/imb-alternate-name'
import { field as imbPeopleName } from './fields/imb-people-name'
import { field as descriptions } from './fields/descriptions'
import { field as imbPeopleDescription } from './fields/imb-people-description'
import { field as imbLocationDescription } from './fields/imb-location-description'

// Identifiers fields
import { field as joshuaProjectId } from './fields/joshua-project-id'
import { field as doxaMasteruid } from './fields/doxa-masteruid'
import { field as doxaWagfUid } from './fields/doxa-wagf-uid'
import { field as imbUid } from './fields/imb-uid'
import { field as imbPgid } from './fields/imb-pgid'
import { field as imbPeid } from './fields/imb-peid'

// Geography fields
import { field as imbIsoalpha3 } from './fields/imb-isoalpha3'
import { field as imbRegion } from './fields/imb-region'
import { field as imbSubregion } from './fields/imb-subregion'
import { field as imbLat } from './fields/imb-lat'
import { field as imbLng } from './fields/imb-lng'
import { field as imbIsIndigenous } from './fields/imb-is-indigenous'

// Population & Engagement fields
import { field as imbPopulation } from './fields/imb-population'
import { field as imbPopulationClass } from './fields/imb-population-class'
import { field as imbEvangelicalPercentage } from './fields/imb-evangelical-percentage'
import { field as imbEvangelicalLevel } from './fields/imb-evangelical-level'
import { field as imbEngagementStatus } from './fields/imb-engagement-status'
import { field as imbCongregationExisting } from './fields/imb-congregation-existing'
import { field as imbChurchPlanting } from './fields/imb-church-planting'

// Strategic Metrics fields
import { field as imbGsec } from './fields/imb-gsec'
import { field as imbStrategicPriorityIndex } from './fields/imb-strategic-priority-index'
import { field as imbLostnessPriorityIndex } from './fields/imb-lostness-priority-index'
import { field as imbAffinityCode } from './fields/imb-affinity-code'

// Language fields
import { field as imbRegOfLanguage } from './fields/imb-reg-of-language'
import { field as imbLanguageFamily } from './fields/imb-language-family'
import { field as imbLanguageClass } from './fields/imb-language-class'
import { field as imbLanguageSpeakers } from './fields/imb-language-speakers'

// Religion fields
import { field as imbRegOfReligion } from './fields/imb-reg-of-religion'
import { field as imbRegOfReligion3 } from './fields/imb-reg-of-religion-3'
import { field as imbRegOfReligion4 } from './fields/imb-reg-of-religion-4'

// ROP (People Classification) fields
import { field as imbRegOfPeople3 } from './fields/imb-reg-of-people-3'
import { field as imbRegOfPeople2 } from './fields/imb-reg-of-people-2'
import { field as imbRegOfPeople1 } from './fields/imb-reg-of-people-1'
import { field as imbRegOfPeople25 } from './fields/imb-reg-of-people-25'

// Resources fields
import { field as imbBibleAvailable } from './fields/imb-bible-available'
import { field as imbJesusFilmAvailable } from './fields/imb-jesus-film-available'
import { field as imbRadioBroadcastAvailable } from './fields/imb-radio-broadcast-available'
import { field as imbGospelRecordingsAvailable } from './fields/imb-gospel-recordings-available'
import { field as imbAudioScriptureAvailable } from './fields/imb-audio-scripture-available'
import { field as imbBibleStoriesAvailable } from './fields/imb-bible-stories-available'
import { field as imbTotalResourcesAvailable } from './fields/imb-total-resources-available'
import { field as imbBibleTranslationLevel } from './fields/imb-bible-translation-level'
import { field as imbBibleYearPublished } from './fields/imb-bible-year-published'

// WAGF/Doxa fields
import { field as doxaWagfRegion } from './fields/doxa-wagf-region'
import { field as doxaWagfBlock } from './fields/doxa-wagf-block'
import { field as doxaWagfMember } from './fields/doxa-wagf-member'

// Media fields
import { field as imageUrl } from './fields/image-url'
import { field as imbPictureCreditHtml } from './fields/imb-picture-credit-html'
import { field as imbHasPhoto } from './fields/imb-has-photo'
import { field as imbPeopleSearchText } from './fields/imb-people-search-text'

// All fields array
export const allFields: FieldDefinition[] = [
  // Basic
  name,
  imbDisplayName,
  imbAlternateName,
  imbPeopleName,
  descriptions,
  imbPeopleDescription,
  imbLocationDescription,
  // Identifiers
  joshuaProjectId,
  doxaMasteruid,
  doxaWagfUid,
  imbUid,
  imbPgid,
  imbPeid,
  // Geography
  imbIsoalpha3,
  imbRegion,
  imbSubregion,
  imbLat,
  imbLng,
  imbIsIndigenous,
  // Population
  imbPopulation,
  imbPopulationClass,
  imbEvangelicalPercentage,
  imbEvangelicalLevel,
  imbEngagementStatus,
  imbCongregationExisting,
  imbChurchPlanting,
  // Strategic
  imbGsec,
  imbStrategicPriorityIndex,
  imbLostnessPriorityIndex,
  imbAffinityCode,
  // Language
  imbRegOfLanguage,
  imbLanguageFamily,
  imbLanguageClass,
  imbLanguageSpeakers,
  // Religion
  imbRegOfReligion,
  imbRegOfReligion3,
  imbRegOfReligion4,
  // ROP
  imbRegOfPeople3,
  imbRegOfPeople2,
  imbRegOfPeople1,
  imbRegOfPeople25,
  // Resources
  imbBibleAvailable,
  imbJesusFilmAvailable,
  imbRadioBroadcastAvailable,
  imbGospelRecordingsAvailable,
  imbAudioScriptureAvailable,
  imbBibleStoriesAvailable,
  imbTotalResourcesAvailable,
  imbBibleTranslationLevel,
  imbBibleYearPublished,
  // WAGF
  doxaWagfRegion,
  doxaWagfBlock,
  doxaWagfMember,
  // Media
  imageUrl,
  imbPictureCreditHtml,
  imbHasPhoto,
  imbPeopleSearchText
]

// Fields grouped by category
export const fieldsByCategory: Record<string, FieldDefinition[]> = allFields.reduce(
  (acc, field) => {
    const category = field.category
    if (!acc[category]) {
      acc[category] = []
    }
    acc[category]!.push(field)
    return acc
  },
  {} as Record<string, FieldDefinition[]>
)

// Fields that are stored as table columns (not in metadata)
export const tableColumnFields = allFields.filter((f) => f.tableColumn)

// Get a field definition by key
export function getField(key: string): FieldDefinition | undefined {
  return allFields.find((f) => f.key === key)
}

// Get options for a field
export function getOptions(key: string): FieldOption[] | undefined {
  const field = getField(key)
  return field?.options
}

// Check if a field is stored as a table column
export function isTableColumn(key: string): boolean {
  const field = getField(key)
  return field?.tableColumn === true
}

// Check if a field should use dynamic options from a library
export function getOptionsSource(key: string): 'countries' | 'languages' | undefined {
  const field = getField(key)
  return field?.optionsSource
}

// Get all fields as a flat list (for backward compatibility)
export function getAllFields(): FieldDefinition[] {
  return allFields
}

// Get field by key (for backward compatibility)
export function getFieldByKey(key: string): FieldDefinition | undefined {
  return getField(key)
}

// Check if field is in metadata (for backward compatibility)
export function isMetadataField(key: string): boolean {
  return !isTableColumn(key)
}

// Table field keys (for backward compatibility)
export const tableFields = tableColumnFields.map((f) => f.key)
