# Translation System (i18n) Setup

This project uses `@nuxtjs/i18n` for internationalization. Locale files live in
the repository and are edited here; there is no external translation platform.

## Overview

- **i18n Module**: @nuxtjs/i18n (built on vue-i18n)
- **Translation files**: `i18n/locales/{code}/` — `common.json`,
  `people-groups.json`, `languages.json`, `bible.json`
- **Which languages exist**: `config/languages.ts`, the single source of truth
  for both `nuxt.config.ts` and application code
- **Terminology**: the DOXA glossary in the database, managed at
  `/admin/glossary` and published at `GET /api/glossary/{lang}`

## Supported Languages

`config/languages.ts` is the list. Each entry carries the English and native
names, the text direction, the bolls.life Bible edition verses are fetched in,
and whether the language is switched on in the UI.

A language is born in the glossary, not here: an admin adds it at
`/admin/glossary`, a reviewer confirms its terms through a magic link, and the
`config/languages.ts` entry is then derived from that record. `/add-language`
does it; `/language-status` shows where any language stands.

`ENABLED_LANGUAGES` drives the language switcher and the i18n locale list.
A language registered but not enabled is still available to the API, to
description translation and to content work, which is how a language is
prepared before it goes public.

## Using Translations in Your Code

### In Templates

```vue
<template>
  <div>
    <!-- Simple translation -->
    <h1>{{ $t('welcome') }}</h1>

    <!-- Nested translation -->
    <button>{{ $t('theme.toggle') }}</button>

    <!-- With parameters -->
    <p>{{ $t('greeting', { name: userName }) }}</p>
  </div>
</template>
```

### In Script Setup

```vue
<script setup lang="ts">
const { t, locale, setLocale } = useI18n()

// Use translation
const welcomeText = t('welcome')

// Get current locale
console.log(locale.value) // 'en', 'es', etc.

// Change locale
await setLocale('es')
</script>
```

### In Composables/Utils

```ts
export function useMyComposable() {
  const { t } = useI18n()

  const message = computed(() => t('common.loading'))

  return { message }
}
```

## Language Switching

The project includes a language selector in the default layout (`app/layouts/default.vue`). Users can switch languages using the dropdown in the header.

### Creating Language-Aware Links

When creating links in your templates, use `localePath()` to ensure URLs have the correct locale prefix:

```vue
<template>
  <!-- Instead of this -->
  <NuxtLink to="/about">About</NuxtLink>

  <!-- Use this -->
  <NuxtLink :to="localePath('/about')">About</NuxtLink>

  <!-- Results: /about (English) or /es/about (Spanish) -->
</template>
```

### Switching Between Languages

To create language switcher links:

```vue
<template>
  <div v-for="locale in availableLocales" :key="locale.code">
    <NuxtLink :to="switchLocalePath(locale.code)">
      {{ locale.name }}
    </NuxtLink>
  </div>
</template>

<script setup lang="ts">
const { locale, locales } = useI18n()
const switchLocalePath = useSwitchLocalePath()

const availableLocales = computed(() => locales.value)
</script>
```

### Programmatic Navigation

```vue
<script setup lang="ts">
const { locale, setLocale } = useI18n()
const localePath = useLocalePath()
const router = useRouter()

// Navigate to a page in current locale
await router.push(localePath('/about'))

// Change locale and navigate
await setLocale('es')
await router.push(localePath('/'))
</script>
```

Language preference is automatically:
- Saved to cookies (key: `preferred_language`)
- Detected from browser settings on first visit
- Persisted across sessions
- Reflected in URL structure

## Adding New Translation Keys

1. Add the key to the right file under `i18n/locales/en/` — `common.json` for
   interface strings, `people-groups.json` for people group fields and options.
2. Add the same key to every other language, translated. `/translate`
   propagates a change from English across the other locales with the glossary
   applied.
3. Never add a key to one locale only. A missing key renders as the key itself.

Example:
```json
{
  "welcome": "Welcome",
  "newKey": "This is a new translation key"
}
```

**Changing an English string invalidates its translations.** Update them in the
same change, or the app ships wording that answers a different question.

## Terminology

Which words a translation uses is not a free choice. The DOXA glossary holds the
approved rendering of each defining term in every language, reviewed by a native
speaker, and it is authoritative for this app, the marketing site and the mobile
app alike.

```bash
curl -s https://pray.doxa.life/api/glossary/es?format=markdown
```

Read it before translating anything. Alongside the terms it carries `notes`: the
language's register, the verbs prayer prompts use, its acronym policy and its
number format. Machine translation injects both automatically; a person or an
agent editing locale files has to apply them deliberately.

A term known by an acronym (UPG, UUPG, CPM) carries it separately from the
wording: `acronym` is the English one and `acronym_translation` the one the
language uses, which is the English acronym unless its reviewer chose another.
A bare acronym in a string takes `acronym_translation`.

Terms marked `draft` are still authoritative. A term nobody has ruled on yet is
applied consistently and corrected once a reviewer rules; a term left to each
file's own invention drifts differently everywhere.

**When a reviewer changes the glossary**, `/sync-language <code>` brings this
repository back into line and `/sync-language-everywhere <code>` does all five.

## Translation File Structure

All translation files follow the same JSON structure:

```json
{
  "welcome": "Welcome",
  "hello": "Hello",
  "language": "Language",
  "theme": {
    "toggle": "Toggle Theme",
    "light": "Light Mode",
    "dark": "Dark Mode"
  },
  "common": {
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "edit": "Edit",
    "create": "Create",
    "back": "Back",
    "next": "Next",
    "previous": "Previous",
    "loading": "Loading..."
  }
}
```

### Naming Conventions

- Use lowercase with underscores for keys: `new_user`, `send_email`
- Group related translations using nested objects
- Keep keys descriptive and context-specific
- Common actions go in the `common` object

## URL Routing Strategy

This project uses `prefix_except_default` strategy:

- **English (default)**: `example.com/` or `example.com/about`
- **Spanish**: `example.com/es/` or `example.com/es/about`
- **French**: `example.com/fr/` or `example.com/fr/about`
- **Other languages**: `example.com/{locale}/`

### How It Works

1. **Default language (English)** has clean URLs without prefix
2. **All other languages** have language code prefix (e.g., `/es/`, `/fr/`)
3. **Browser detection** automatically redirects users to their preferred language on first visit
4. **Cookie persistence** remembers language choice across sessions
5. **SEO-friendly** - each language has its own URL

### Examples

```
/                  → English homepage
/about             → English about page
/es/               → Spanish homepage
/es/about          → Spanish about page
/fr/admin/users    → French admin users page
```

## Configuration

The i18n configuration is in `nuxt.config.ts`:

```typescript
i18n: {
  // Generated from config/languages.ts, so the enabled list is stated once
  locales: generateI18nLocales(),
  defaultLocale: 'en',
  langDir: 'locales',
  strategy: 'prefix_except_default',
  detectBrowserLanguage: {
    useCookie: true,
    cookieKey: 'preferred_language',
    redirectOn: 'root',
    alwaysRedirect: true
  }
}
```

### Configuration Options

- **locales**: generated from `config/languages.ts` by `generateI18nLocales()`, so adding a language is one edit there
- **defaultLocale**: Fallback language (English) - served without prefix
- **langDir**: Directory containing translation files
- **strategy**: 'prefix_except_default' - default locale has no prefix, others do
- **detectBrowserLanguage**: Auto-detect and redirect to user's preferred language
- **alwaysRedirect**: Always redirect to detected language (not just on root)

## Best Practices

1. **Always add keys to all language files**
   - Even if you only have the English translation initially
   - Use English as a fallback for missing translations

2. **Keep translations short and clear**
   - Avoid complex sentences that are hard to translate
   - Consider context when writing keys

3. **Use pluralization when needed**
   ```json
   {
     "items": "No items | One item | {count} items"
   }
   ```

4. **Test in multiple languages**
   - Check text overflow in longer languages (German, Russian)
   - Verify RTL support for Arabic

5. **Name keys so the context is obvious**
   - A key read out of context is all a translator gets
   - Where a slot is tight — a button, a chip, a status label — say so in the
     key's own name or beside it

## Troubleshooting

### Translations not updating
- Clear Nuxt cache: `rm -rf .nuxt`
- Rebuild: `npm run dev`

### A language is missing its glossary
- `python3 .claude/skills/language-status/language_status.py {code}` says so
- A language with no glossary translates without approved terminology, which is
  worse than it sounds: every file invents its own word for "people group"

### Missing translations
- Check the key exists in the matching file under `i18n/locales/en/`
- Verify JSON syntax is valid
- Look for typos in translation keys

## Resources

- [@nuxtjs/i18n Documentation](https://i18n.nuxtjs.org/)
- The glossary: `/admin/glossary`, published at `GET /api/glossary/{lang}`
- [Vue I18n Documentation](https://vue-i18n.intlify.dev/)
