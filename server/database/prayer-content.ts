import { getDatabase } from './db'
import { appConfigService } from './app-config'
import { libraryContentService } from './library-content'
import { libraryService, PEOPLE_GROUP_LIBRARY_ID, DAILY_PEOPLE_GROUP_LIBRARY_ID, DAY_IN_LIFE_LIBRARY_ID } from './libraries'
import { peopleGroupService } from './people-groups'
import { getFieldOptionLabel, getReligionLabel, getCountryLabel } from '../utils/app/field-options'
import { generatePeopleGroupDescription } from '../utils/app/people-group-description'

export interface PeopleGroupData {
  name: string
  image_url: string | null
  description: string | null
  population: number | null
  language: string | null
  religion: string | null
  country: string | null
  lat: number | null
  lng: number | null
  picture_credit: Array<{ text: string; link: string | null }> | null
}

export interface PrayerContent {
  id: number
  people_group_id: number
  content_date: string
  language_code: string
  title: string
  content_json: Record<string, any> | null
  content_type: 'static' | 'people_group'
  people_group_data?: PeopleGroupData | null
  created_at: string
  updated_at: string
}

export interface CreatePrayerContentData {
  people_group_id: number
  content_date: string
  language_code: string
  title: string
  content_json?: any
}

export interface UpdatePrayerContentData {
  title?: string
  content_json?: any
  content_date?: string
  language_code?: string
}

export class PrayerContentService {
  private db = getDatabase()

  /**
   * Convert a date string to a day number based on global start date
   */
  private async dateToDayNumber(date: string): Promise<number> {
    const globalStartDate = await appConfigService.getConfig<string>('global_campaign_start_date')

    if (!globalStartDate) {
      throw new Error('Global start date is not configured')
    }

    const startDate = new Date(globalStartDate)
    const targetDate = new Date(date)

    const diffTime = targetDate.getTime() - startDate.getTime()
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

    // Day numbers start at 1, so add 1
    return diffDays + 1
  }

  /**
   * Convert a day number to a date string based on global start date
   */
  private async dayNumberToDate(dayNumber: number): Promise<string> {
    const globalStartDate = await appConfigService.getConfig<string>('global_campaign_start_date')

    if (!globalStartDate) {
      throw new Error('Global start date is not configured')
    }

    const startDate = new Date(globalStartDate)
    // Day numbers start at 1, so subtract 1
    startDate.setDate(startDate.getDate() + (dayNumber - 1))

    return startDate.toISOString().split('T')[0]!
  }

  /**
   * Get global library configuration (row-based)
   */
  private async getGlobalRows(): Promise<Array<{ rowIndex: number; libraries: Array<{ libraryId: number; order: number }> }>> {
    const globalConfig = await appConfigService.getConfig('global_campaign_libraries')

    if (!globalConfig || !globalConfig.rows) {
      return []
    }

    return globalConfig.rows
  }

  /**
   * Get library stats (total days) - cached for efficiency
   * For repeating libraries, returns 999999 (infinite)
   * Use getLibraryActualDays() to get the real day count for modulo calculations
   */
  private libraryStatsCache: Map<number, number> = new Map()
  private libraryTypeCache: Map<number, string> = new Map()
  private libraryActualDaysCache: Map<number, number> = new Map()

  private async getLibraryTotalDays(libraryId: number): Promise<number> {
    if (this.libraryStatsCache.has(libraryId)) {
      return this.libraryStatsCache.get(libraryId)!
    }

    // Virtual People Group libraries have infinite days
    if (libraryId === PEOPLE_GROUP_LIBRARY_ID) {
      this.libraryStatsCache.set(libraryId, 999999)
      this.libraryTypeCache.set(libraryId, 'people_group')
      return 999999
    }

    if (libraryId === DAILY_PEOPLE_GROUP_LIBRARY_ID) {
      this.libraryStatsCache.set(libraryId, 999999)
      this.libraryTypeCache.set(libraryId, 'daily_people_group')
      return 999999
    }

    // Virtual Day in the Life library has infinite days
    if (libraryId === DAY_IN_LIFE_LIBRARY_ID) {
      this.libraryStatsCache.set(libraryId, 999999)
      this.libraryTypeCache.set(libraryId, 'day_in_life')
      return 999999
    }

    // Get actual day count from database
    const dayRange = await libraryContentService.getDayRange(libraryId)
    const actualDays = dayRange?.maxDay || 0
    this.libraryActualDaysCache.set(libraryId, actualDays)

    // Check if library is repeating
    const library = await libraryService.getLibraryById(libraryId)
    if (library?.repeating) {
      this.libraryStatsCache.set(libraryId, 999999)
      this.libraryTypeCache.set(libraryId, 'repeating')
      return 999999
    }

    this.libraryTypeCache.set(libraryId, 'static')
    this.libraryStatsCache.set(libraryId, actualDays)
    return actualDays
  }

  /**
   * Clear cached data for a specific library (call when library settings change)
   */
  clearLibraryCache(libraryId: number): void {
    this.libraryStatsCache.delete(libraryId)
    this.libraryTypeCache.delete(libraryId)
    this.libraryActualDaysCache.delete(libraryId)
  }

  /**
   * Get the actual day count for a library (for modulo calculations with repeating libraries)
   */
  private async getLibraryActualDays(libraryId: number): Promise<number> {
    if (this.libraryActualDaysCache.has(libraryId)) {
      return this.libraryActualDaysCache.get(libraryId)!
    }

    // Ensure the cache is populated
    await this.getLibraryTotalDays(libraryId)
    return this.libraryActualDaysCache.get(libraryId) || 0
  }

  private async getLibraryType(libraryId: number): Promise<string> {
    if (this.libraryTypeCache.has(libraryId)) {
      return this.libraryTypeCache.get(libraryId)!
    }
    // This will populate the cache
    await this.getLibraryTotalDays(libraryId)
    return this.libraryTypeCache.get(libraryId) || 'static'
  }

  /**
   * For a given people group day and row, find which library contains that day
   * and return the day number within that library
   */
  private async findLibraryForDay(row: { rowIndex: number; libraries: Array<{ libraryId: number; order: number }> }, peopleGroupDay: number): Promise<{ libraryId: number; dayInLibrary: number } | null> {
    let accumulatedDays = 0

    // Sort libraries by order
    const sortedLibraries = [...row.libraries].sort((a, b) => a.order - b.order)

    for (const libConfig of sortedLibraries) {
      const libraryTotalDays = await this.getLibraryTotalDays(libConfig.libraryId)
      if (libraryTotalDays === 0) continue

      const libraryStartDay = accumulatedDays + 1
      const libraryEndDay = accumulatedDays + libraryTotalDays

      if (peopleGroupDay >= libraryStartDay && peopleGroupDay <= libraryEndDay) {
        return {
          libraryId: libConfig.libraryId,
          dayInLibrary: peopleGroupDay - accumulatedDays
        }
      }

      accumulatedDays += libraryTotalDays
    }

    // People group day exceeds all libraries in this row
    return null
  }

  /**
   * Get all unique library IDs from all rows (for aggregate operations)
   */
  private async getAllLibraryIds(): Promise<number[]> {
    const rows = await this.getGlobalRows()
    const libraryIds = new Set<number>()

    for (const row of rows) {
      for (const lib of row.libraries) {
        // Skip virtual library IDs (negative numbers) for aggregate operations
        if (lib.libraryId > 0) {
          libraryIds.add(lib.libraryId)
        }
      }
    }

    return Array.from(libraryIds)
  }

  /**
   * Transform library content to prayer content format
   */
  private transformLibraryContent(libraryContent: any, peopleGroupId: number, date: string): PrayerContent {
    return {
      id: libraryContent.id,
      people_group_id: peopleGroupId,
      content_date: date,
      language_code: libraryContent.language_code,
      title: '', // Library content doesn't have titles, but keeping for compatibility
      content_json: libraryContent.content_json,
      content_type: 'static',
      created_at: libraryContent.created_at,
      updated_at: libraryContent.updated_at
    }
  }

  /**
   * Generate people group content for a people group
   * Includes Day in the Life content if a people-group-specific library exists
   */
  private async generatePeopleGroupContent(peopleGroupId: number, date: string, languageCode: string): Promise<PrayerContent | null> {
    const peopleGroup = await peopleGroupService.getPeopleGroupById(peopleGroupId)
    if (!peopleGroup) {
      return null
    }

    // Parse metadata for additional fields
    let description: string | null = null
    let population: number | null = null
    let language: string | null = null
    let religion: string | null = null
    let country: string | null = null
    let lat: number | null = null
    let lng: number | null = null
    let pictureCredit: Array<{ text: string; link: string | null }> | null = null

    if (peopleGroup.metadata) {
      const metadata = peopleGroup.metadata
      description = generatePeopleGroupDescription({
        name: peopleGroup.name,
        descriptions: peopleGroup.descriptions,
        metadata
      }, languageCode)
      population = metadata.imb_population ? parseInt(metadata.imb_population, 10) : null

      const langCode = metadata.imb_reg_of_language
      const religionCode = metadata.imb_reg_of_religion_3
      const countryCode = metadata.imb_isoalpha3

      language = langCode ? (getFieldOptionLabel('imb_reg_of_language', langCode, languageCode) || langCode) : null
      religion = religionCode ? (getReligionLabel(religionCode, languageCode) || religionCode) : null
      country = countryCode ? (getCountryLabel(countryCode, languageCode) || countryCode) : null

      lat = metadata.imb_lat ? parseFloat(metadata.imb_lat) : null
      lng = metadata.imb_lng ? parseFloat(metadata.imb_lng) : null

      pictureCredit = metadata.picture_credit || null
    }

    const now = new Date().toISOString()

    return {
      id: -1, // Virtual content - no actual database ID
      people_group_id: peopleGroupId,
      content_date: date,
      language_code: languageCode,
      title: peopleGroup.name,
      content_json: null, // Not used for people_group type
      content_type: 'people_group',
      people_group_data: {
        name: peopleGroup.name,
        image_url: peopleGroup.image_url,
        description,
        population,
        language,
        religion,
        country,
        lat,
        lng,
        picture_credit: pictureCredit
      },
      created_at: now,
      updated_at: now
    }
  }

  /**
   * Generate daily people group content - rotates through all people groups
   * Each people group shows a different people group based on their linked group's random_order offset
   */
  private async generateDailyPeopleGroupContent(peopleGroupId: number, date: string, languageCode: string, dayNumber: number): Promise<PrayerContent | null> {
    const linkedPeopleGroup = await peopleGroupService.getPeopleGroupById(peopleGroupId)
    if (!linkedPeopleGroup?.random_order) {
      return null
    }

    // Get total count of people groups
    const totalPeopleGroups = await peopleGroupService.countPeopleGroups()
    if (totalPeopleGroups === 0) {
      return null
    }

    // Calculate the daily random_order: offset by the people group's random_order
    // Formula: ((dayNumber + offset - 1) % total) + 1
    const offset = linkedPeopleGroup.random_order
    const dailyOrder = ((dayNumber + offset - 1) % totalPeopleGroups) + 1

    // Fetch the people group by random_order
    const peopleGroup = await peopleGroupService.getPeopleGroupByRandomOrder(dailyOrder)
    if (!peopleGroup) {
      return null
    }

    // Parse metadata for additional fields
    let description: string | null = null
    let population: number | null = null
    let language: string | null = null
    let religion: string | null = null
    let country: string | null = null
    let lat: number | null = null
    let lng: number | null = null
    let pictureCredit: Array<{ text: string; link: string | null }> | null = null

    if (peopleGroup.metadata) {
      const metadata = peopleGroup.metadata
      description = generatePeopleGroupDescription({
        name: peopleGroup.name,
        descriptions: peopleGroup.descriptions,
        metadata
      }, languageCode)
      population = metadata.imb_population ? parseInt(metadata.imb_population, 10) : null

      const langCode = metadata.imb_reg_of_language
      const religionCode = metadata.imb_reg_of_religion_3
      const countryCode = metadata.imb_isoalpha3

      language = langCode ? (getFieldOptionLabel('imb_reg_of_language', langCode, languageCode) || langCode) : null
      religion = religionCode ? (getReligionLabel(religionCode, languageCode) || religionCode) : null
      country = countryCode ? (getCountryLabel(countryCode, languageCode) || countryCode) : null

      lat = metadata.imb_lat ? parseFloat(metadata.imb_lat) : null
      lng = metadata.imb_lng ? parseFloat(metadata.imb_lng) : null

      pictureCredit = metadata.picture_credit || null
    }

    const now = new Date().toISOString()

    return {
      id: -2, // Virtual content ID for daily people group
      people_group_id: peopleGroupId,
      content_date: date,
      language_code: languageCode,
      title: peopleGroup.name,
      content_json: null,
      content_type: 'people_group',
      people_group_data: {
        name: peopleGroup.name,
        image_url: peopleGroup.image_url,
        description,
        population,
        language,
        religion,
        country,
        lat,
        lng,
        picture_credit: pictureCredit
      },
      created_at: now,
      updated_at: now
    }
  }

  /**
   * Generate Day in the Life content for a people group
   * Looks up the people group's day_in_life library and fetches the appropriate day's content
   */
  private async generateDayInLifeContent(peopleGroupId: number, date: string, languageCode: string): Promise<PrayerContent | null> {
    try {
      // Get the people group's day_in_life library
      const library = await libraryService.getPeopleGroupLibraryByKey(peopleGroupId, 'day_in_life')
      if (!library) {
        return null
      }

      // Calculate people group day number from date
      const peopleGroupDay = await this.dateToDayNumber(date)

      // Get total days in the library for cycling
      const dayRange = await libraryContentService.getDayRange(library.id)
      const totalDays = dayRange?.maxDay || 365

      // Cycle the day number if content runs longer than library
      const dayToFetch = ((peopleGroupDay - 1) % totalDays) + 1

      const content = await libraryContentService.getLibraryContentByDay(
        library.id,
        dayToFetch,
        languageCode
      )

      if (!content?.content_json) {
        return null
      }

      const now = new Date().toISOString()

      return {
        id: -3, // Virtual content ID for Day in the Life
        people_group_id: peopleGroupId,
        content_date: date,
        language_code: languageCode,
        title: '', // Title handled via translation in frontend
        content_json: content.content_json,
        content_type: 'static',
        created_at: now,
        updated_at: now
      }
    } catch (e) {
      console.warn('Could not fetch Day in the Life content:', e)
      return null
    }
  }

  // ==========================================
  // READ OPERATIONS (Library-based)
  // ==========================================

  /**
   * Get prayer content by ID
   * Note: This is deprecated as content is now library-based, not people-group-specific
   */
  async getPrayerContentById(id: number): Promise<PrayerContent | null> {
    // This would need to search across all libraries, which is inefficient
    // For now, return null and log deprecation warning
    console.warn('getPrayerContentById is deprecated - content is now library-based')
    return null
  }

  /**
   * Get prayer content by people group, date, and language
   * Uses row-based scheduling - returns first content found across all rows
   */
  async getPrayerContentByDate(peopleGroupId: number, date: string, languageCode: string = 'en'): Promise<PrayerContent | null> {
    try {
      // Convert date to people group day number
      const dayNumber = await this.dateToDayNumber(date)

      // Get global rows
      const rows = await this.getGlobalRows()

      if (rows.length === 0) {
        return null
      }

      // Search rows for content on this day
      for (const row of rows) {
        const libraryInfo = await this.findLibraryForDay(row, dayNumber)

        if (libraryInfo) {
          const content = await libraryContentService.getLibraryContentByDay(
            libraryInfo.libraryId,
            libraryInfo.dayInLibrary,
            languageCode
          )

          if (content) {
            return this.transformLibraryContent(content, peopleGroupId, date)
          }
        }
      }

      return null
    } catch (error) {
      console.error('Error getting prayer content by date:', error)
      return null
    }
  }

  /**
   * Get ALL prayer content for a specific date from ALL rows
   * Uses row-based scheduling: each row runs in parallel, libraries within a row run sequentially
   */
  async getAllPrayerContentByDate(peopleGroupId: number, date: string, languageCode: string = 'en'): Promise<PrayerContent[]> {
    try {
      // Convert date to people group day number
      const dayNumber = await this.dateToDayNumber(date)

      // Get global rows
      const rows = await this.getGlobalRows()

      if (rows.length === 0) {
        return []
      }

      const allContent: PrayerContent[] = []

      // For each row, find which library contains this people group day
      for (const row of rows) {
        const libraryInfo = await this.findLibraryForDay(row, dayNumber)

        if (libraryInfo) {
          // Check the library type
          const libraryType = await this.getLibraryType(libraryInfo.libraryId)

          if (libraryType === 'people_group') {
            // Generate linked people group content
            const peopleGroupContent = await this.generatePeopleGroupContent(peopleGroupId, date, languageCode)
            if (peopleGroupContent) {
              allContent.push(peopleGroupContent)
            }
          } else if (libraryType === 'daily_people_group') {
            // Generate daily rotating people group content
            const dailyContent = await this.generateDailyPeopleGroupContent(peopleGroupId, date, languageCode, dayNumber)
            if (dailyContent) {
              allContent.push(dailyContent)
            }
          } else if (libraryType === 'day_in_life') {
            // Generate Day in the Life content from people group's library
            const dayInLifeContent = await this.generateDayInLifeContent(peopleGroupId, date, languageCode)
            if (dayInLifeContent) {
              allContent.push(dayInLifeContent)
            }
          } else {
            // Calculate the actual day to fetch (wrap for repeating libraries)
            let dayToFetch = libraryInfo.dayInLibrary

            if (libraryType === 'repeating') {
              const actualDays = await this.getLibraryActualDays(libraryInfo.libraryId)
              if (actualDays > 0) {
                // Wrap day number: day 31 in a 30-day library becomes day 1
                dayToFetch = ((libraryInfo.dayInLibrary - 1) % actualDays) + 1
              }
            }

            // Fetch content from this library at the calculated day
            const content = await libraryContentService.getLibraryContentByDay(
              libraryInfo.libraryId,
              dayToFetch,
              languageCode
            )

            if (content) {
              allContent.push(this.transformLibraryContent(content, peopleGroupId, date))
            }
          }
        }
        // If libraryInfo is null, this row is exhausted - nothing to display
      }

      // Sort by row index (maintain row order)
      return allContent
    } catch (error) {
      console.error('Error getting all prayer content by date:', error)
      return []
    }
  }

  /**
   * Get all languages available for a specific people group and date
   * Uses row-based scheduling
   */
  async getAvailableLanguages(peopleGroupId: number, date: string): Promise<string[]> {
    try {
      // Convert date to people group day number
      const dayNumber = await this.dateToDayNumber(date)

      // Get global rows
      const rows = await this.getGlobalRows()

      const languageSet = new Set<string>()

      // Collect languages from all rows for this people group day
      for (const row of rows) {
        const libraryInfo = await this.findLibraryForDay(row, dayNumber)

        if (libraryInfo) {
          const languages = await libraryContentService.getAvailableLanguages(
            libraryInfo.libraryId,
            libraryInfo.dayInLibrary
          )
          languages.forEach(lang => languageSet.add(lang))
        }
      }

      return Array.from(languageSet).sort()
    } catch (error) {
      console.error('Error getting available languages:', error)
      return []
    }
  }

  /**
   * Get all prayer content for a people group
   * This now fetches from all libraries across all rows
   */
  async getPeopleGroupPrayerContent(peopleGroupId: number, options?: {
    startDate?: string
    endDate?: string
    language?: string
    limit?: number
    offset?: number
  }): Promise<PrayerContent[]> {
    try {
      // Get all library IDs from all rows
      const libraryIds = await this.getAllLibraryIds()

      if (libraryIds.length === 0) {
        return []
      }

      // Convert dates to day numbers
      let startDay: number | undefined
      let endDay: number | undefined

      if (options?.startDate) {
        startDay = await this.dateToDayNumber(options.startDate)
      }

      if (options?.endDate) {
        endDay = await this.dateToDayNumber(options.endDate)
      }

      // Fetch content from all libraries
      const allContent: PrayerContent[] = []

      for (const libraryId of libraryIds) {
        const libraryContent = await libraryContentService.getLibraryContent(libraryId, {
          startDay,
          endDay,
          language: options?.language
        })

        // Transform each library content item to prayer content format
        for (const item of libraryContent) {
          const date = await this.dayNumberToDate(item.day_number)
          allContent.push(this.transformLibraryContent(item, peopleGroupId, date))
        }
      }

      // Sort by content_date DESC (like the old behavior)
      allContent.sort((a, b) => {
        if (a.content_date !== b.content_date) {
          return b.content_date.localeCompare(a.content_date)
        }
        return a.language_code.localeCompare(b.language_code)
      })

      // Apply limit and offset
      let result = allContent
      if (options?.offset) {
        result = result.slice(options.offset)
      }
      if (options?.limit) {
        result = result.slice(0, options.limit)
      }

      return result
    } catch (error) {
      console.error('Error getting people group prayer content:', error)
      return []
    }
  }

  /**
   * Get prayer content grouped by date with language information
   */
  async getPeopleGroupContentGroupedByDate(peopleGroupId: number, options?: {
    startDate?: string
    endDate?: string
    limit?: number
    offset?: number
  }): Promise<Array<{ date: string; languages: string[] }>> {
    try {
      // Get all library IDs from all rows
      const libraryIds = await this.getAllLibraryIds()

      if (libraryIds.length === 0) {
        return []
      }

      // Convert dates to day numbers
      let startDay: number | undefined
      let endDay: number | undefined

      if (options?.startDate) {
        startDay = await this.dateToDayNumber(options.startDate)
      }

      if (options?.endDate) {
        endDay = await this.dateToDayNumber(options.endDate)
      }

      // Collect all day numbers and their languages across libraries
      const dayMap = new Map<number, Set<string>>()

      for (const libraryId of libraryIds) {
        const grouped = await libraryContentService.getLibraryContentGroupedByDay(libraryId, {
          startDay,
          endDay
        })

        grouped.forEach(({ dayNumber, languages }) => {
          if (!dayMap.has(dayNumber)) {
            dayMap.set(dayNumber, new Set())
          }
          languages.forEach(lang => dayMap.get(dayNumber)!.add(lang))
        })
      }

      // Convert day numbers back to dates
      const result: Array<{ date: string; languages: string[] }> = []

      for (const [dayNumber, languageSet] of dayMap.entries()) {
        const date = await this.dayNumberToDate(dayNumber)
        result.push({
          date,
          languages: Array.from(languageSet).sort()
        })
      }

      // Sort by date DESC
      result.sort((a, b) => b.date.localeCompare(a.date))

      // Apply limit and offset
      let finalResult = result
      if (options?.offset) {
        finalResult = finalResult.slice(options.offset)
      }
      if (options?.limit) {
        finalResult = finalResult.slice(0, options.limit)
      }

      return finalResult
    } catch (error) {
      console.error('Error getting people group content grouped by date:', error)
      return []
    }
  }

  /**
   * Get content count for people group
   */
  async getContentCount(peopleGroupId: number): Promise<number> {
    try {
      // Get all library IDs from all rows
      const libraryIds = await this.getAllLibraryIds()

      let totalCount = 0

      for (const libraryId of libraryIds) {
        const count = await libraryContentService.getContentCount(libraryId)
        totalCount += count
      }

      return totalCount
    } catch (error) {
      console.error('Error getting content count:', error)
      return 0
    }
  }

  // ==========================================
  // WRITE OPERATIONS (Deprecated)
  // ==========================================

  /**
   * @deprecated People-group-specific content creation is no longer supported.
   * Content should be created in libraries via the library management system.
   */
  async createPrayerContent(data: CreatePrayerContentData): Promise<PrayerContent> {
    throw new Error(
      'People-group-specific content creation is deprecated. ' +
      'Please create content in libraries via /admin/libraries instead.'
    )
  }

  /**
   * @deprecated People-group-specific content updates are no longer supported.
   * Content should be edited in libraries via the library management system.
   */
  async updatePrayerContent(id: number, data: UpdatePrayerContentData): Promise<PrayerContent | null> {
    throw new Error(
      'People-group-specific content updates are deprecated. ' +
      'Please edit content in libraries via /admin/libraries instead.'
    )
  }

  /**
   * @deprecated People-group-specific content deletion is no longer supported.
   * Content should be managed in libraries via the library management system.
   */
  async deletePrayerContent(id: number): Promise<boolean> {
    throw new Error(
      'People-group-specific content deletion is deprecated. ' +
      'Please manage content in libraries via /admin/libraries instead.'
    )
  }
}

// Export singleton instance
export const prayerContentService = new PrayerContentService()
