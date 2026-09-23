// The checklist for putting a new language into every DOXA surface.
//
// Code owns the list: `language_rollout_tasks` stores only a task's state once
// it has left "pending", keyed by `key`. Adding a task or rewording one is an
// edit to this file.
//
// - `detected` tasks are worked out by the server from its own data and cannot be ticked.
// - `skill` tasks are reported by /add-language-everywhere; the repository ones
//   have keys matching the surfaces in the language-status report.
// - `manual` tasks are ticked by an admin on /admin/onboarding.

export type RolloutTaskKind = 'detected' | 'skill' | 'manual'

export interface RolloutTaskGroup {
  key: string
  label: string
}

export interface RolloutTaskDef {
  key: string
  group: string
  kind: RolloutTaskKind
  label: string
  description: string
}

export const ROLLOUT_TASK_GROUPS: readonly RolloutTaskGroup[] = [
  { key: 'glossary', label: 'Glossary' },
  { key: 'code', label: 'Code' },
  { key: 'content', label: 'Content' },
  { key: 'launch', label: 'Go live' }
]

export const ROLLOUT_TASKS: readonly RolloutTaskDef[] = [
  {
    key: 'glossary-terms',
    group: 'glossary',
    kind: 'detected',
    label: 'Terms confirmed',
    description: 'Every glossary term confirmed by a native-speaking reviewer'
  },
  {
    key: 'glossary-notes',
    group: 'glossary',
    kind: 'detected',
    label: 'Translation notes',
    description: 'Register, prayer-prompt verbs, acronym policy and number format'
  },
  {
    key: 'campaigns-server',
    group: 'code',
    kind: 'skill',
    label: 'Campaigns server',
    description: 'config/languages.ts entry, locale files, and the language name in every other locale'
  },
  {
    key: 'marketing',
    group: 'code',
    kind: 'skill',
    label: 'Marketing site',
    description: 'doxa.life strings, terms edition and map locales'
  },
  {
    key: 'mobile',
    group: 'code',
    kind: 'skill',
    label: 'Mobile app',
    description: 'ARB strings and the app locale list'
  },
  {
    key: 'pipeline',
    group: 'code',
    kind: 'skill',
    label: 'Resource pipeline',
    description: 'Prayer-card captions in the language atlas'
  },
  {
    key: 'people-groups',
    group: 'code',
    kind: 'skill',
    label: 'People-groups prompts',
    description: 'Registered for on-demand Day in the Life translation'
  },
  {
    key: 'people-group-descriptions',
    group: 'content',
    kind: 'detected',
    label: 'People group descriptions',
    description: 'Translated by /add-language-everywhere before the resource pipeline draws them'
  },
  {
    key: 'shared-libraries',
    group: 'content',
    kind: 'detected',
    label: 'Shared prayer libraries',
    description: 'Translated by /translate-libraries once the language is deployed on pray.doxa.life'
  },
  {
    key: 'day-in-the-life',
    group: 'content',
    kind: 'manual',
    label: 'Day in the Life prompts',
    description: 'Translated per people group, on demand, in the people-groups repository'
  },
  {
    key: 'enabled-campaigns',
    group: 'launch',
    kind: 'detected',
    label: 'Switched on at pray.doxa.life',
    description: 'enabled in config/languages.ts and deployed'
  },
  {
    key: 'enabled-marketing',
    group: 'launch',
    kind: 'skill',
    label: 'Switched on at doxa.life',
    description: 'enabled in the marketing site config and deployed'
  },
  {
    key: 'cms-drafts',
    group: 'launch',
    kind: 'skill',
    label: 'CMS page drafts',
    description: 'Every doxa.life CMS page machine-translated as a draft; possible only once the language is live on doxa.life'
  },
  {
    key: 'cms-pages',
    group: 'launch',
    kind: 'manual',
    label: 'CMS pages published',
    description: 'Auto-translated doxa.life pages reviewed and published'
  },
  {
    key: 'homepage-video',
    group: 'launch',
    kind: 'manual',
    label: 'Homepage video',
    description: 'The Vimeo video on the doxa.life homepage translated'
  },
  {
    key: 'playbook',
    group: 'launch',
    kind: 'manual',
    label: 'Playbook',
    description: 'The playbook created in this language'
  },
  {
    key: 'app-store-listings',
    group: 'launch',
    kind: 'manual',
    label: 'App store listings',
    description: 'Google Play and App Store listings in this language'
  }
]

export const ROLLOUT_TASK_STATES = ['pending', 'running', 'done', 'failed', 'skipped'] as const
export type RolloutTaskState = typeof ROLLOUT_TASK_STATES[number]

export function getRolloutTask(key: string): RolloutTaskDef | undefined {
  return ROLLOUT_TASKS.find(task => task.key === key)
}
