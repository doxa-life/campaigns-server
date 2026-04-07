# IMB People Groups Update

Update Doxa people group data from the latest IMB export.

## When to use
When the user wants to update people group data from IMB (typically quarterly).

## Process

### 1. Run the comparison script (dry run first)

```bash
python3 .claude/skills/imb-update/imb-update.py --api-key API_KEY [--base-url URL] [--csv PATH]
```

- Without `--csv`, the script downloads from https://peoplegroups.org/wp-content/uploads/people_groups.csv and caches it in `data/tmp/`.
- Default `--base-url` is `http://localhost:3000`. For production use `https://pray.doxa.life`.
- The user must provide the `--api-key`. Check `.env` for `ADMIN_API_KEY` or ask the user.

### 2. Review the report with the user

Walk through the output, highlighting:
- **Newly engaged** people groups (engagement_status changing to engaged)
- **Removed PEIDs** (in Doxa but not in IMB) — investigate what happened to them
- **Skipped fields** (manual edits being preserved)
- **Field change counts** — flag anything unexpected (e.g. thousands of changes in a field that shouldn't change much)

### 3. Check for new field option codes

Before applying, verify that any new codes in the data have corresponding entries in the field definitions:

- `imb_reg_of_people_1` (ROP1/Affinity Bloc) — check `app/utils/people-group-fields/fields/imb-reg-of-people-1.ts` and `i18n/locales/*/people-groups.json` under `rop1`
- `imb_reg_of_people_2` (ROP2/People Cluster) — check `app/utils/people-group-fields/fields/imb-reg-of-people-2.ts`
- `imb_affinity_code` — check `app/utils/people-group-fields/fields/imb-affinity-code.ts`

Add any missing codes before applying updates.

### 4. Apply updates

After user approval, run with `--apply`. The script will show the report again and prompt for confirmation before sending.

```bash
python3 .claude/skills/imb-update/imb-update.py --api-key API_KEY [--base-url URL] [--csv PATH] --apply
```

**IMPORTANT:** Always wait for the user to confirm before running `--apply`. Do NOT run it automatically after the dry run.

### 5. Verify

Spot-check a few records in the admin UI, especially:
- Newly engaged groups (should show engagement badge + reason_engaged: imb_report)
- Groups with alternate name changes (should not show "changed to: (empty)")
- Archived groups (should show archived status with reason: merged_or_deleted)

## What the script updates

**Table columns:** population, engagement_status, primary_religion, primary_language, latitude, longitude

**Metadata fields:** imb_gsec, imb_congregation_existing, imb_church_planting, imb_affinity_code, imb_reg_of_people_1/2/3/25, imb_is_indigenous, resource availability booleans (bible, jesus film, radio, gospel, audio, stories), imb_reg_of_religion_4, imb_alternate_name

## What the script does NOT update

- **Format-mismatch fields:** imb_evangelical_level, imb_population_class, imb_reg_of_religion_3, imb_bible_translation_level (stored as codes, IMB sends labels)
- **Never-stored fields:** imb_strategic_priority_index, imb_lostness_priority_index, imb_language_family, imb_language_class, imb_language_speakers, imb_location_description, imb_people_description_raw, imb_total_resources_available, imb_bible_year_published
- **image_url** (IMB changed URL domains, we host our own)

## Key behaviors

- **Manual edits preserved:** Activity logs with source != "IMB Report Update" mark fields as manually edited. Those fields are skipped.
- **Never erases with null:** If IMB has no value (or literal "None") but Doxa has a real value, the Doxa value is kept.
- **Auto-sets reason_engaged:** When engagement_status changes to "engaged", the bulk-update endpoint automatically sets reason_engaged to "imb_report".
- **Activity logging:** All changes are logged as "IMB Report Update" in the activity log with field-level diffs.
