// Built-in section definitions for a context portfolio.
//
// Code owns the catalog: a portfolio's rows in `context_section_definitions`
// store only the keys it has, and title/description/order for a built-in key
// resolve from here. Adding a built-in section or changing its wording is an
// edit to this file, never a migration or a data backfill. A custom section
// carries its own title and description on its definition row.

export interface ContextSectionDef {
  key: string
  title: string
  description: string
  order: number
}

export const CONTEXT_SECTIONS: readonly ContextSectionDef[] = [
  {
    key: 'identity',
    title: 'Identity',
    description: 'What the organization is — name, origin, positioning',
    order: 1
  },
  {
    key: 'vision-and-values',
    title: 'Vision & Values',
    description: 'Why the organization exists — mission and guiding beliefs',
    order: 2
  },
  {
    key: 'team',
    title: 'Team',
    description: 'Leadership, staff, and key roles within the organization',
    order: 3
  },
  {
    key: 'goals-and-priorities',
    title: 'Goals & Priorities',
    description: 'What the organization is working toward',
    order: 4
  },
  {
    key: 'communication-style',
    title: 'Communication Style',
    description: 'How the organization speaks — voice, tone, audience',
    order: 5
  },
  {
    key: 'personas',
    title: 'Personas',
    description: 'Target audience personas — demographics, needs, and how to address them',
    order: 6
  },
  {
    key: 'tools-and-systems',
    title: 'Tools & Systems',
    description: 'What the organization runs on — stack and workflows',
    order: 7
  },
  {
    key: 'translation',
    title: 'Translation',
    description: 'How projects are localized — languages, workflows, and tools per project',
    order: 8
  },
  {
    key: 'decision-log',
    title: 'Decision Log',
    description: 'Key decisions, pivots, and the reasoning behind them',
    order: 9
  }
] as const

export const CONTEXT_SECTION_KEYS: ReadonlySet<string> = new Set(
  CONTEXT_SECTIONS.map(s => s.key)
)

/** Where a section with no stored position sits when it is not a built-in. */
export const CONTEXT_BUILTIN_MAX_ORDER = Math.max(0, ...CONTEXT_SECTIONS.map(s => s.order))

export function getDefaultContextSection(key: string): ContextSectionDef | null {
  return CONTEXT_SECTIONS.find(s => s.key === key) ?? null
}

/** Derive a custom section's key from its title. */
export function slugifySectionTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}
