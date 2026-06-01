# Library Import & Export

## Overview

The import/export feature lets you move prayer content libraries between environments or create backups of your work. You can export a library as a file, then import it elsewhere—whether that's a different people group, a test environment, or sharing with another team.

This is particularly useful when you've created a library in one place and want to reuse it without manually recreating all the content.

## Exporting a Library

### Where to Export From

You can export any library from two places:

**Global Libraries** - In the Libraries admin section, each library row has an Export button. Click it to download that library.

**People Group Libraries** - In a people group's content section, each library has an Export button next to it.

### What Gets Exported

When you export, you get a file containing:

- The library's name and description
- All days of content (Day 1, Day 2, etc.)
- All language translations for each day
- The rich text formatting (headings, lists, images, videos, etc.)

The file downloads immediately with a name like `library-morning-prayers-2024-01-16.json`.

### What Cannot Be Exported

Virtual libraries (People Group and Daily People Group) cannot be exported because they don't contain static content—they pull information dynamically from the people groups in the system.

## Importing a Library

### Starting an Import

The Import button appears in the same places as Export:

- In the Libraries admin section header
- In a people group's content section header

Clicking Import opens a step-by-step wizard that guides you through the process.

### Step 1: Upload Your File

Drag and drop your export file onto the upload area, or click to browse for it. The file must be a JSON file from a previous export.

If the file is invalid or corrupted, you'll see an error message explaining what's wrong.

### Step 2: Preview and Choose Options

Before importing, you see a preview of what's in the file:

- Library name and description
- How many days have content
- How many content items total
- Which languages are included, with coverage counts

You then choose how to import:

**Create New Library** - Makes a brand new library with the imported content. You can optionally give it a different name than what's in the file.

**Replace Existing Library** - Overwrites an existing library's content completely. You select which library to replace from a dropdown. A warning reminds you that all existing content will be deleted.

### Step 3: Importing

The import runs automatically. For large libraries with many days and languages, this may take a moment. You'll see a progress indicator.

### Step 4: Complete

Once finished, you see a summary of what was imported:

- How many content items were added
- How many were skipped (if any duplicates existed)
- How many were replaced (if overwriting)

A button takes you directly to the imported library so you can review it.

## How Content Is Handled

### Rich Text Formatting

All formatting from the original library is preserved—headings, bold text, lists, images, embedded videos, and other styling carry over to the imported library.

The system validates the content during import to ensure it's safe and properly formatted. Any unsupported elements are cleaned up automatically.

### Languages

The import supports all eleven languages available in the system: English, Spanish, French, Portuguese, German, Italian, Chinese, Arabic, Russian, Hindi, and Romanian.

If the export file contains content in an unsupported language code, the import will fail with an error message listing the problematic languages.

### Duplicate Handling

If you import into an existing library and there's already content for a specific day and language, the existing content is kept and the duplicate from the import file is skipped. This prevents accidental overwrites when adding to an existing library.

To fully replace content, use the "Replace Existing Library" option, which clears everything first.

## Sharing Between Teams

Export files are self-contained and portable. You can:

- Email an export file to another team
- Store exports as backups before making major changes
- Move content from a test environment to production
- Create a "template" library that multiple people groups can import and customize

When someone imports your file, they get an independent copy. Changes they make won't affect your original library, and vice versa.

## Design Decisions

**Immediate download** - Export files download instantly rather than being emailed or stored somewhere. This keeps things simple and gives you immediate access to your file.

**Preview before import** - The wizard shows you exactly what's in the file before committing. This prevents surprises and lets you verify you selected the right file.

**Atomic imports** - Either the entire import succeeds or nothing changes. If something goes wrong partway through, the system rolls back rather than leaving you with partial content.

**Content sanitization** - All imported content is validated and cleaned to ensure it's safe. This protects against corrupted files or malicious content while preserving legitimate formatting.

**Duplicate skip vs. overwrite** - When importing into an existing library, duplicates are skipped rather than overwritten. This is safer for incremental imports. Use "Replace Existing Library" when you want a clean slate.

## Current Limitations

- Only JSON format is supported (no CSV, Excel, or other formats)
- Cannot import content for a single language—it's all or nothing
- Cannot merge two libraries together (importing into an existing library skips duplicates rather than merging)
- No way to preview individual days before importing
- Large imports happen synchronously, so very large libraries may take noticeable time
- Cannot export multiple libraries at once into a single file
