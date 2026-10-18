# Compressed People Group Image Copies

Smaller copies of people group photos for the mobile app. Added October 2026.

## Why

People group photos are hotlinked from wherever they came from (`image_url`):
IMB, Joshua Project, or our own placeholders on `s3.doxa.life`. In October 2026
the 939 distinct photos totalled about 127 MB, and 76 IMB featured images were
109 MB of that (1.6–2.1 MB each: 1024×1024 PNGs named `.jpg`). The mobile app
caches every photo it shows (up to 1,200 for 30 days), so it was holding about
100 MB of photos on users' phones.

## What it does

A background job downloads each distinct photo once, re-encodes it, and stores
the copy in the public images bucket. The API returns the copy as
`compressed_image_url` so the app can use it instead of `image_url`.

- Copies are JPEGs, at most 1024px on the long side (the widest the app draws a
  photo), quality 80, rotated using EXIF data and with EXIF/GPS metadata removed.
  Images with real transparency stay PNG/WebP. GIFs are copied unchanged. If
  re-encoding wouldn't make a photo smaller, the copy is the original bytes.
- The big IMB photos go from about 2 MB to about 120 KB.

## What it does not touch (the website is unaffected)

- `people_groups` rows, `image_url`, `metadata`, and activity logs are never
  written. Copies live in their own table.
- The original photos are never modified or deleted.
- Uploads (`uploadPublicImage()` without options) store the original bytes
  exactly as before.
- `/api/people-groups/list` (default and `fields=all`), `/highlighted`,
  `/statistics`, the admin CSV export, and `global-content` return exactly what
  they did before.
- `/api/people-groups/detail/{slug}` and
  `/api/people-groups/{slug}/prayer-content/{date}` gain one extra key,
  `compressed_image_url`. Neither the marketing site (doxa-life) nor
  pray.doxa.life reads it, and neither loops over a response's keys.
- Lookups never throw. If the table is missing or the query fails, the
  endpoints return the original photo URL.

This was verified before deploy by running the `master` build and the new build
side by side against the same database seeded with 60 real people groups and
comparing every people group endpoint both sites call. The only difference was
the added key on detail and prayer-content. The same held with the copies table
removed.

## How it works

| Piece | File |
|---|---|
| Table `people_group_image_copies` | `migrations/118_people_group_image_copies.js` |
| Re-encoding with sharp | `server/utils/app/image-compression.ts` |
| Making copies, and the lookups the API uses | `server/utils/app/people-group-image-copies.ts` |
| Schedule | `server/plugins/image-copy-scheduler.ts` |
| Upload option (`compress`, `prefix`, `cacheControl`) | `server/utils/app/public-image-storage.ts` |
| API field | `server/api/people-groups/list.get.ts`, `detail/[slug].get.ts`, `[slug]/prayer-content/[date]/index.get.ts`, `server/database/prayer-content.ts`, `server/utils/app/people-group-formatter.ts` |

### The table

One row per distinct photo URL, keyed by the original:

| Column | Meaning |
|---|---|
| `source_url` | The original `image_url` (primary key) |
| `copy_url` | Public URL of the compressed copy; NULL if the download failed |
| `failed_at` | When the last download failed; retried 24 hours later |
| `created_at` | When the row was first written |

Copies are stored at `uploads/people-group-images/<random>.jpg` in the
`S3_PUBLIC_BUCKET` and served from `S3_PUBLIC_BASE_URL` with
`Cache-Control: public, max-age=31536000, immutable`.

Groups that share a photo share one row. When a group's `image_url` changes
(import, edit, applied suggestion), its new photo has no row yet, so
`compressed_image_url` is the original URL until the next run makes a copy.
Photos behind the admin-only suggestion proxy
(`/api/admin/people-group-reports/image/pg-suggestions/...`) are read straight
from the private bucket.

### The schedule

- Two minutes after each server start, so a deploy starts the backfill.
- Daily at 4:30 AM UTC, after the Monday IMB sync.
- Each run copies everything pending, 50 photos per batch. A run is skipped
  entirely if nothing is pending.
- Only one instance runs per day: it claims a `claimLock` row in
  `activity_logs` keyed `image-copy-scheduler:YYYY-MM-DD`. If a deploy restarts
  the server partway through a run, the rest waits for the next day's run.
- It runs in production by default and needs `S3_PUBLIC_BUCKET` and
  `S3_PUBLIC_BASE_URL`. Set `ENABLE_IMAGE_COPIES=true` to run it outside
  production, or `ENABLE_IMAGE_COPIES=false` to turn it off.
- sharp is limited to one thread with no operation cache, so the web servers
  keep their CPU and memory for requests.

Log lines: `🖼️  Compressed image copies: N made, M failed` and
`Compressed image copy failed for <url>: <reason>`.

### The API field

`compressed_image_url` is the copy if one exists for the current `image_url`,
otherwise the original `image_url` (null only if `image_url` is null). It is
never a broken link.

- List: only when asked for, e.g.
  `/api/people-groups/list?fields=slug,image_url,compressed_image_url`
- Detail: always present
- Prayer content: on `people_group` and on each `people_group_data`

Documented in `server/openapi.yaml`.

## Using it in the mobile app

In `doxa-prayer-mobile-app`:

1. Add `compressed_image_url` to `_listFields` in
   `lib/services/people_groups_service.dart`, and bump the version constant
   below it so cached list bodies are refetched.
2. Where models read `json['image_url']` (`lib/models/people_group.dart`,
   `people_group_detail.dart`, `prayer_content.dart`), read
   `json['compressed_image_url'] ?? json['image_url']`.

The old large files already in the app's image cache drop out as they reach 30
days old. To free the space immediately, rename the cache key in
`lib/services/image_cache_manager.dart` (`doxa_image_cache`).

## Checking on it

```sql
-- Progress: photos in use vs copied vs failed
SELECT
  (SELECT count(DISTINCT image_url) FROM people_groups
     WHERE image_url IS NOT NULL AND image_url <> '' AND status <> 'archived') AS photos_in_use,
  (SELECT count(*) FROM people_group_image_copies WHERE copy_url IS NOT NULL) AS copied,
  (SELECT count(*) FROM people_group_image_copies WHERE copy_url IS NULL)     AS failed;

-- Failed downloads
SELECT source_url, failed_at FROM people_group_image_copies WHERE copy_url IS NULL;

-- Retry a failure now instead of in 24 hours (then restart, or wait for 4:30 AM UTC)
DELETE FROM people_group_image_copies WHERE source_url = '<url>' AND copy_url IS NULL;
```

The day's run is already claimed after a restart if it ran that day. To force
another run on the same day, delete that day's lock first:

```sql
DELETE FROM activity_logs WHERE id = md5('image-copy-scheduler:' || to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD'))::uuid;
```

## How to reverse it

From the lightest step to full removal. Each step is safe alone, and the website
never depends on any of this.

1. **Stop making copies.** Set `ENABLE_IMAGE_COPIES=false` in the DigitalOcean
   app's environment variables and redeploy. Existing copies keep being served.
2. **Stop the app using copies.** Make the app read `image_url` again (undo the
   app change above), or make the API return the original. Emptying the table
   does that immediately, with no deploy:
   ```sql
   TRUNCATE people_group_image_copies;
   ```
   Every `compressed_image_url` then equals `image_url`. If the job is still
   enabled, it will make copies again on its next run, so do step 1 first.
3. **Remove the code.** `git revert` the commit that added this. The revert
   removes the field from the API, the job, sharp, and the upload option; the
   app falls back to `image_url` if it uses `?? json['image_url']`. Migrations
   only run forward, so the table stays until you drop it:
   ```sql
   DROP TABLE IF EXISTS people_group_image_copies;
   ```
   Then remove its row from the `migrations` tracking table, so it runs
   again if it's ever re-added:
   ```sql
   DELETE FROM migrations WHERE source = 'project' AND migration_id = 118;
   ```
4. **Delete the stored copies** (optional, they are small, about 20 MB total).
   Delete the `uploads/people-group-images/` prefix in the public bucket. Do
   this only after steps 2–3, or the app would get broken links.

Nothing in this feature overwrote or deleted data, so there is nothing to restore.
