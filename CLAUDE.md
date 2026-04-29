# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
We are Jan 2026

## Project Overview

DOXA Prayer is a Nuxt 4.1 application for managing and distributing daily prayer content to subscribers. It features people group management, subscriber CRM, content libraries, multi-language support (10 languages), and email notifications.

This project consumes the base layer: https://github.com/corsacca/nuxt-base

## Rules

- **NEVER edit `.env` directly** - Ask the user to make environment variable changes
- **Always kill dev servers you start**
- **Never use `alert()` or `confirm()`** - Use toasts and modals instead
- **Reference `documentation/nuxt-ui-modals.md`** when building modals
- **Use Nuxt UI components** - See https://ui.nuxt.com/llms.txt for documentation
- **Type-check after editing `.ts`/`.vue` files** — Run `npx nuxi typecheck` to catch type errors you introduced. Fix any you caused; do not fix pre-existing ones unless asked.

## Nuxt Routing Rules (CRITICAL)

Avoid routing conflicts in Nuxt file-based routing:
- **NEVER** create both `pages/section.vue` AND `pages/section/[id]/page.vue`
- **ALWAYS** use nested structure: `pages/section/index.vue` + `pages/section/[id]/page.vue`
- When adding nested routes, move existing flat files to `index.vue` in subdirectory

```
❌ pages/admin/users.vue + pages/admin/users/[id]/activity.vue
✅ pages/admin/users/index.vue + pages/admin/users/[id]/activity.vue
```

## Development Commands

```bash
bun run dev          # Start development server (runs migrations automatically)
bun run build        # Build for production
bun run start        # Start production server (runs migrations automatically)
bun run postinstall  # Nuxt prepare
bun run migrate      # Run database migrations manually
bun install          # Install dependencies
```

## Testing

Tests are end-to-end tests using vitest. Requires `TEST_DATABASE_URL` in `.env`.

**Do NOT use `bun test`** — it skips vitest's global setup and the Nuxt server won't start.

```bash
# Run all tests
npx vitest run

# Run a specific test file
npx vitest run tests/e2e/admin/users/role.test.ts

# Run tests matching a pattern
npx vitest run subscribers
```

**Retrieving output**: vitest writes to TTY, so piping loses output. Use the JSON reporter to capture results:

```bash
npx vitest run --reporter=json --outputFile=/tmp/vitest-results.json
```

**Recreating the test database** (when migrations are out of sync):

```bash
psql -U postgres -c "DROP DATABASE prayertools_test;"
psql -U postgres -c "CREATE DATABASE prayertools_test;"
DATABASE_URL=$TEST_DATABASE_URL bun run migrate
```

## Architecture

### Base Layer Pattern

This project extends a shared Nuxt base layer (`github:corsacca/nuxt-base`). See `documentation/BASE_LAYER.md` for full reference.

The layer is extracted to `.layers/nuxt-base/` (re-extracted on every `nuxt prepare`/`nuxt dev`/`nuxt build`, gitignored). Read or grep its source there — not under `node_modules/.c12/`.

**Base layer provides:**
- Database connection (`sql` from `#imports`)
- Authentication system (`useAuth()` composable, `auth` middleware)
- Theme system (`useTheme()` composable, `<ThemeToggle />` component)
- Email utilities (`sendEmail`, `sendTemplateEmail`)
- S3 storage (`uploadToS3`, `generateSignedUrl`, `deleteFromS3`)
- Activity logging (`logCreate`, `logUpdate`, `logDelete`)

Local utilities in `server/utils/app/` are excluded from auto-imports to avoid conflicts with the base layer. Access them through `server/utils` re-exports.

**Key base layer composables:**
```typescript
// Authentication
const { user, isLoggedIn, authReady, login, logout, register, checkAuth } = useAuth()

// Theme
const { theme, toggleTheme } = useTheme()
```

**Server-side auth utilities:**
```typescript
import { requireAuth, getAuthUser } from '../utils/auth'

// Require authentication (throws 401 if not authenticated)
const user = await requireAuth(event)  // { userId, email, display_name }

// Optional authentication (returns null if not authenticated)
const user = await getAuthUser(event)
```

### Key Directories

```
app/
  components/     # Vue components (RichTextEditor, modals, etc.)
  composables/    # useAuthUser, usePeopleGroup, useModal
  layouts/        # default.vue, admin.vue
  middleware/     # superadmin.ts, guest.ts
  pages/          # File-based routing
  utils/          # languages.ts, tiptap.ts

server/
  api/            # API endpoints (Nitro file-based routing)
  database/       # Database access functions (people groups, libraries, subscribers, etc.)
  plugins/        # Schedulers (backup, reminder, marketing-email)
  utils/          # Email templates, auth, media upload

migrations/       # PostgreSQL migrations (auto-run on startup)
i18n/locales/     # Translation files (en.json, es.json, fr.json, etc.)
```

### Database

- PostgreSQL with the `postgres` package
- `server/database/db.ts` provides a wrapper mimicking better-sqlite3 API
- Migrations in `migrations/` directory auto-execute on startup
- Migration files: `{number}_{description}.js`, extend `BaseMigration`

### Content System

- **Libraries**: Centralized content managed in `/admin/libraries`
- **Library Content**: Organized by day number (1-365+), each day can have multiple language versions
- **People Groups**: Subscribe to libraries via global configuration at `/admin/prayer-fuel-order`
- Prayer content uses Tiptap rich text editor (stored as JSON, rendered as HTML)

### API Pattern

API routes follow Nitro conventions:
- `server/api/admin/` - Admin-only endpoints (require authentication)
- `server/api/people-groups/[slug]/` - Public people group endpoints
- `server/api/libraries/` - Public library endpoints

### Authentication

- JWT-based authentication (base layer)
- Roles: superadmin, admin
- Middleware: `auth` (base layer), `superadmin.ts`, `guest.ts` (project)
- `useAuth()` composable for client-side auth state (base layer)
- `useAuthUser()` composable extends auth for project-specific needs

### Email System

Server plugins run scheduled tasks:
- `reminder-scheduler.ts` - Prayer reminder emails
- `marketing-email-scheduler.ts` - Marketing emails
- `backup-scheduler.ts` - Database backups to S3

Email templates in `server/utils/`: `prayer-reminder-email.ts`, `welcome-email.ts`, `invitation-email.ts`

## Internationalization

- languages, see config/languages.ts
- Translation files: `i18n/locales/*.json`
- URL strategy: `prefix_except_default` (English has no prefix)
- Use `$t('key')` in templates, `useI18n()` in scripts
- Use `localePath()` for navigation links
- **Translation glossaries**: When translating text, follow the DeepL glossaries in `../translation/deepl-glossaries/` to ensure consistent terminology (e.g., "people group" has specific translations per language)

## Styling

- Light/dark mode support via base layer theme system
- Use **Tailwind CSS** for styling
- Theme toggle available via `<ThemeToggle />` component

## UI Components

**Always use Nuxt UI components** instead of plain HTML for consistent theming:

- `<UButton>` not `<button>`
- `<UInput>` not `<input>`
- `<UTextarea>` not `<textarea>`
- `<USelect>` not `<select>`
- `<UCard>` not `<div class="card">`
- `<UModal>` not custom modal divs
- `<UTable>` not `<table>`

Icons use Lucide: `<UButton icon="i-lucide-plus">Add</UButton>`

Reference: https://ui.nuxt.com/components

## Tech Stack

- **Runtime**: Bun
- **Frontend**: Nuxt 4.1, Vue 3, Nuxt UI v4, Tailwind CSS
- **Backend**: Nitro (Nuxt server), PostgreSQL
- **Editor**: Tiptap (rich text)
- **Email**: Nodemailer
- **Storage**: S3-compatible (DigitalOcean Spaces)

## Configuration

Runtime config in `nuxt.config.ts` pulls from environment variables:
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Authentication secret
- `SMTP_*` - Email configuration
- `S3_*` - S3/Spaces configuration
- `NUXT_PUBLIC_SITE_URL` - Public URL for links in emails

## Scheduled Tasks (Multi-Instance Safety)

The app runs on multiple DigitalOcean App Platform instances. All schedulers must be safe to run concurrently. Two patterns are used:

### High-volume polling tasks (e.g., reminder emails)
Use `SELECT ... FOR UPDATE OF <table> SKIP LOCKED LIMIT <batch>` inside a short transaction to claim and advance rows atomically. Each instance processes a different batch. See `claimSubscriptionsDueForReminder()` in `server/database/people-group-subscriptions.ts`.

### Singleton cron/periodic tasks (e.g., backups, followups, activity emails)
Use `claimLock` — INSERT a deterministic UUID (`md5(lockKey)::uuid`) into `activity_logs` with `ON CONFLICT (id) DO NOTHING`. Only the instance whose INSERT returns a row proceeds. Lock key format: `{scheduler-name}:{period-key}` (e.g., `backup-scheduler:2026-03-12`).

## Hooks (WordPress-style Actions)

A lightweight `addAction` / `doAction` system in `server/utils/hooks.ts` for decoupled cross-cutting concerns.

```typescript
// Register a hook (in a server plugin, runs at startup)
addAction('record.delete', async (recordType: string, recordId: number) => {
  await commentService.deleteForRecord(recordType, recordId)
})

// Fire a hook (in an API handler or service)
await doAction('record.delete', 'subscriber', id)
```

**Registering hooks**: Create a server plugin in `server/plugins/` that calls `addAction()`. Plugins run at startup, guaranteeing hooks are registered before any request. Each feature owns its own plugin (e.g., `comment-hooks.ts`).

**Firing hooks**: Call `doAction()` from API handlers. It's auto-imported from `server/utils/hooks.ts`.

**Current hooks**:
- `record.delete(recordType, recordId)` — fired before a record is deleted. Used by comments cleanup.

## Record Types (CRM Pattern)

Three record types share the CRM list/detail slideover pattern with comments and activity logging:

- **People Groups** — `people_groups` table, pages at `/admin/people-groups/`, components use `record_type: "people_group"`, `table_name: "people_groups"`
- **Groups** — `groups` table, pages at `/admin/groups/`, components use `record_type: "group"`, `table_name: "groups"`
- **Subscribers** — `subscribers` table, pages at `/admin/subscribers/`, components use `record_type: "subscriber"`, `table_name: "subscribers"`

All three use: `CrmLayout`, `CrmDetailPanel` with side tabs, `RecordComments`, `RecordActivity`.

**When making UI or API changes to one record type, verify the change applies correctly to all three.** They share components in `app/components/crm/` — a fix to one often needs the same fix on the others.

## Documentation

Reference documentation in `documentation/` folder:
- `BASE_LAYER.md` - Base layer (authentication, theme, email, storage, database)
- `nuxt-ui-modals.md` - Modal implementation patterns
- `wysiwyg-editor.md` - Tiptap editor implementation
- `nuxt-4x-*.md` - Nuxt 4.x framework documentation
