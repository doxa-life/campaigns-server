import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }

  async tableExists(sql, table) {
    const result = await sql`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${table}
    `
    return result.length > 0
  }

  async indexExists(sql, indexName) {
    const result = await sql`
      SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = ${indexName}
    `
    return result.length > 0
  }
}

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'glossary')

/**
 * The target-language half of a locale file's reviewer wording. The English
 * half is code-owned in config/glossary-chrome.ts, so only the translated
 * strings are stored.
 */
function localChrome(locale) {
  const instructions = locale.instructions || {}
  const labels = locale.labels || {}
  const reviewer = locale.reviewer || {}

  const localLabels = {}
  for (const [key, value] of Object.entries(labels)) {
    if (key.endsWith('_local')) localLabels[key.slice(0, -'_local'.length)] = value
  }
  // The review form's Approve action is the page's Confirm action.
  if (localLabels.approve && !localLabels.confirm) localLabels.confirm = localLabels.approve

  const reviewerRows = {}
  for (const row of reviewer.rows || []) {
    if (row.tag && row.local) reviewerRows[row.tag] = row.local
  }

  return {
    instructions: {
      heading: instructions.local_heading || '',
      purpose_label: instructions.local_purpose_label || '',
      purpose: instructions.local_purpose || '',
      items: instructions.local_items || []
    },
    section_titles: locale.section_titles || {},
    field_labels: locale.field_labels || {},
    labels: localLabels,
    reviewer: {
      heading: reviewer.heading_local || '',
      bible_label: reviewer.bible_label_local || '',
      bible_note: reviewer.bible_note_local || '',
      rows: reviewerRows
    }
  }
}

export default class GlossaryMigration extends BaseMigration {
  id = 101
  name = 'Create glossary tables and seed the English glossary with its drafted languages'

  async up(sql) {
    // The English glossary is authoritative and grouped into ordered sections.
    if (!(await this.tableExists(sql, 'glossary_sections'))) {
      await this.exec(sql, `
        CREATE TABLE glossary_sections (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          title TEXT NOT NULL,
          intro TEXT NOT NULL DEFAULT '',
          position INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
    }

    // `term` is the reviewer-facing English headword. `fields` holds the
    // annotations a reviewer judges against — site definition, example, why it
    // matters — as an ordered array of { label, value }, because the set of
    // labels differs from term to term.
    if (!(await this.tableExists(sql, 'glossary_terms'))) {
      await this.exec(sql, `
        CREATE TABLE glossary_terms (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          section_id UUID NOT NULL REFERENCES glossary_sections(id) ON DELETE CASCADE,
          term TEXT NOT NULL UNIQUE,
          seed BOOLEAN NOT NULL DEFAULT FALSE,
          fields JSONB NOT NULL DEFAULT '[]'::jsonb,
          position INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
    }
    if (!(await this.indexExists(sql, 'idx_glossary_terms_section'))) {
      await this.exec(sql, `
        CREATE INDEX idx_glossary_terms_section ON glossary_terms(section_id, position)
      `)
    }

    // A glossary language is independent of config/languages.ts: work on a
    // language starts here long before it is registered in code. `chrome` holds
    // the reviewer-page wording in that language — instructions, section
    // titles, field labels — which is AI-drafted with the terms.
    //
    // The Bible translation is a property of the language, not of a reviewer:
    // biblical phrasing across every term is aligned to the one a local church
    // community actually uses. `bible_id` is the bolls.life edition selected
    // from its catalog; `bible_translation` is free text for an edition bolls
    // does not carry.
    if (!(await this.tableExists(sql, 'glossary_languages'))) {
      await this.exec(sql, `
        CREATE TABLE glossary_languages (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          code TEXT NOT NULL UNIQUE,
          name_en TEXT NOT NULL,
          name_local TEXT NOT NULL DEFAULT '',
          text_direction TEXT NOT NULL DEFAULT 'ltr' CHECK (text_direction IN ('ltr', 'rtl')),
          chrome JSONB NOT NULL DEFAULT '{}'::jsonb,
          bible_id TEXT,
          bible_translation TEXT,
          bible_translation_note TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
    }

    // A review pass is one round of review on one language, named by an admin
    // ("French pass 1"). Its token is the magic link. The reviewer types their
    // own name on the page, so a pass carries both the admin's label and the
    // person who actually worked it.
    if (!(await this.tableExists(sql, 'glossary_review_passes'))) {
      await this.exec(sql, `
        CREATE TABLE glossary_review_passes (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          language_id UUID NOT NULL REFERENCES glossary_languages(id) ON DELETE CASCADE,
          label TEXT NOT NULL,
          token TEXT NOT NULL UNIQUE,
          reviewer_name TEXT,
          status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'submitted')),
          submitted_at TIMESTAMPTZ,
          last_seen_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
    }
    if (!(await this.indexExists(sql, 'idx_glossary_passes_language'))) {
      await this.exec(sql, `
        CREATE INDEX idx_glossary_passes_language
        ON glossary_review_passes(language_id, created_at DESC)
      `)
    }

    // One approved wording per term per language. `status` is the review state:
    // a draft is AI-proposed and unreviewed, confirmed has been judged by a
    // person, flagged is a term a reviewer wants discussed. `stale` marks a
    // translation whose English term changed after it was reviewed.
    if (!(await this.tableExists(sql, 'glossary_translations'))) {
      await this.exec(sql, `
        CREATE TABLE glossary_translations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          language_id UUID NOT NULL REFERENCES glossary_languages(id) ON DELETE CASCADE,
          term_id UUID NOT NULL REFERENCES glossary_terms(id) ON DELETE CASCADE,
          value TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'flagged')),
          note TEXT,
          stale BOOLEAN NOT NULL DEFAULT FALSE,
          updated_by_name TEXT,
          updated_by_pass_id UUID REFERENCES glossary_review_passes(id) ON DELETE SET NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (language_id, term_id)
        )
      `)
    }
    if (!(await this.indexExists(sql, 'idx_glossary_translations_language'))) {
      await this.exec(sql, `
        CREATE INDEX idx_glossary_translations_language
        ON glossary_translations(language_id)
      `)
    }

    // Every change to a translation appends a revision, which is what makes
    // live editing safe: any prior wording can be restored, and two passes that
    // disagree about a term leave both answers on the record.
    if (!(await this.tableExists(sql, 'glossary_translation_revisions'))) {
      await this.exec(sql, `
        CREATE TABLE glossary_translation_revisions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          translation_id UUID NOT NULL REFERENCES glossary_translations(id) ON DELETE CASCADE,
          value TEXT NOT NULL,
          status TEXT NOT NULL,
          note TEXT,
          reviewer_name TEXT,
          pass_id UUID REFERENCES glossary_review_passes(id) ON DELETE SET NULL,
          source TEXT NOT NULL DEFAULT 'review',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
    }
    if (!(await this.indexExists(sql, 'idx_glossary_revisions_translation'))) {
      await this.exec(sql, `
        CREATE INDEX idx_glossary_revisions_translation
        ON glossary_translation_revisions(translation_id, created_at DESC)
      `)
    }

    await this.seed(sql)
  }

  /**
   * Load the English glossary and every drafted language from data/glossary.
   * Runs only when the glossary is empty, so an edited term is never
   * overwritten by a later re-run.
   */
  async seed(sql) {
    const [existing] = await sql`SELECT 1 FROM glossary_sections LIMIT 1`
    if (existing) {
      console.log('  ℹ️  glossary already seeded')
      return
    }

    const english = JSON.parse(readFileSync(join(DATA_DIR, 'glossary.en.json'), 'utf8'))

    const termIdByTerm = new Map()
    let sectionPosition = 0
    for (const section of english.sections || []) {
      const [row] = await sql`
        INSERT INTO glossary_sections (title, intro, position)
        VALUES (${section.title}, ${section.intro || ''}, ${sectionPosition++})
        RETURNING id
      `
      let termPosition = 0
      for (const entry of section.entries || []) {
        const fields = (entry.fields || []).map(([label, value]) => ({ label, value }))
        const [term] = await sql`
          INSERT INTO glossary_terms (section_id, term, seed, fields, position)
          VALUES (${row.id}, ${entry.term}, ${!!entry.seed}, ${sql.json(fields)}::jsonb, ${termPosition++})
          RETURNING id
        `
        termIdByTerm.set(entry.term, term.id)
      }
    }
    console.log(`  ✅ seeded ${termIdByTerm.size} English glossary terms`)

    const localeFiles = readdirSync(join(DATA_DIR, 'languages')).filter(f => f.endsWith('.json')).sort()
    for (const file of localeFiles) {
      const locale = JSON.parse(readFileSync(join(DATA_DIR, 'languages', file), 'utf8'))
      const chrome = localChrome(locale)

      const [language] = await sql`
        INSERT INTO glossary_languages (code, name_en, name_local, text_direction, chrome)
        VALUES (
          ${locale.locale_code},
          ${locale.language_name_en || locale.output_name || locale.locale_code},
          ${locale.language_name_local || ''},
          ${locale.text_direction === 'rtl' ? 'rtl' : 'ltr'},
          ${sql.json(chrome)}::jsonb
        )
        RETURNING id
      `

      let seeded = 0
      for (const [term, value] of Object.entries(locale.suggested_terms || {})) {
        const termId = termIdByTerm.get(term)
        if (!termId) continue
        await sql`
          INSERT INTO glossary_translations (language_id, term_id, value, status)
          VALUES (${language.id}, ${termId}, ${value}, 'draft')
        `
        seeded++
      }
      console.log(`  ✅ seeded ${locale.locale_code} with ${seeded} drafted terms`)
    }
  }
}
