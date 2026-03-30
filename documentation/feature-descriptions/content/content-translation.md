# Content Translation

## Overview

The translation feature lets you automatically translate prayer content into multiple languages using DeepL, a professional translation service. Rather than manually translating each day's content, you can translate individual items or entire libraries with a few clicks.

This dramatically reduces the effort needed to make content available in all eleven supported languages: English, Spanish, French, Portuguese, German, Italian, Chinese, Arabic, Russian, Hindi, and Romanian.

## Two Ways to Translate

### Translate Individual Days

When you're working on a specific day's content, you can translate just that day. This is useful when you've just written or updated content and want to quickly make it available in other languages.

From any day's overview page, you have two options:

**Translate to one language** - Click the Translate button next to a specific language row. This translates the content into just that language.

**Translate to all languages** - Click the Translate All button at the top. This translates the content into all languages that don't already have a translation.

Individual translations happen immediately. You'll see the results within seconds, and the page updates to show the new translations.

### Translate an Entire Library

When you have a complete library in one language and want to translate all of it, bulk translation is more efficient than translating day by day.

From the library's content calendar, click "Translate All Content" to queue translations for every day in the library across all target languages.

Because this can involve thousands of translations, bulk translation runs in the background. A progress window shows you how many translations are pending, processing, completed, and failed. The window updates automatically every few seconds.

You can close the progress window and continue working—the translations will keep processing. Or you can watch the progress and cancel if needed.

## How to Translate

### Starting a Translation

When you click any translate button, a dialog opens asking you to choose options:

**Translate from** - Select which language to use as the source. The dropdown only shows languages that have content available.

**Translate to** - Shows which language or languages will receive translations. For individual translations, this might be one language. For bulk translations, it's all nine other languages.

**Overwrite existing translations** - If the target language already has content, this checkbox appears. Check it to replace existing translations with fresh ones. Leave it unchecked to skip languages that already have translations.

**Retranslate verses** - When content includes Bible verses, you can choose whether to re-fetch them in the target language. Unchecking this skips verse translation, which is useful if verses have already been manually reviewed or if you only want to update the surrounding text.

### Watching Bulk Translation Progress

For bulk translations, a progress window opens showing:

- A progress bar with how many translations are complete
- Status breakdown: Pending (waiting), Processing (in progress), Completed, Failed
- Verse warnings listing any Bible verse references that couldn't be found in the target language
- A Cancel button to stop remaining translations

The window polls for updates automatically. When all translations finish, you can close the window and the page will reload to show your new content.

### Canceling Translations

If you start a bulk translation and change your mind, click Cancel in the progress window. This stops any pending translations from starting. Translations already in progress will finish, but no new ones will begin.

## What Gets Translated

The translator handles rich text content intelligently:

**Text is translated** - All paragraphs, headings, list items, and other text content goes through DeepL's translation service.

**Formatting is preserved** - Bold, italic, links, lists, headings, and other formatting carry over to the translated version. The structure of your content stays intact.

**Media is kept as-is** - Images, videos, and other embedded media aren't translated (they don't need to be) and remain in the translated version.

**Bible verses** - Verses embedded in the content can optionally be re-fetched in the target language from a Bible API. If a verse isn't available in a particular language, the system records a warning so you know which verses need attention.

## Translation Quality

Translations use DeepL's quality-optimized model, which prioritizes accuracy over speed. DeepL is known for producing natural-sounding translations that read well, though as with any automated translation, the results may occasionally need minor adjustments for context or terminology specific to prayer content.

We recommend having a native speaker review important translations, especially for content that will reach many subscribers.

## When Translations Happen

**Individual translations** run immediately. The system calls DeepL's API directly and returns results within seconds. You'll see a confirmation message showing how many languages were translated successfully.

**Bulk translations** are queued and processed in the background. The system works through translations steadily, with small pauses between each to respect DeepL's rate limits. A library with 365 days translating to 9 languages means over 3,000 individual translations, which can take a few hours to complete.

You don't need to keep the page open for bulk translations to continue. They'll process in the background and be ready when you return.

## Handling Failures

Sometimes translations fail—DeepL might be temporarily unavailable, or there could be an issue with specific content. The system handles this gracefully:

**Automatic retries** - Failed translations are retried up to three times before being marked as failed.

**Partial success is fine** - If some translations succeed and others fail, you keep the successful ones. You can retry the failed ones later.

**Clear reporting** - The progress window shows exactly how many translations failed. For individual translations, you'll see which specific languages had issues.

If translations consistently fail, check that DeepL is configured correctly in the system settings or contact your administrator.

## Who Can Translate

Translation requires content editing permissions. Admins can translate any library. People Group Editors can translate content in libraries they have access to.

## Design Decisions

**DeepL for quality** - We chose DeepL over other translation services because it consistently produces more natural, readable translations, especially for the kind of reflective content found in prayer materials.

**Background processing for bulk** - Translating an entire library synchronously would time out and block the interface. Running translations as background jobs lets you continue working and handles large libraries reliably.

**Skip by default, overwrite optional** - When translations already exist, we skip them by default. This prevents accidentally overwriting translations that someone may have manually refined. The overwrite option is there when you specifically want fresh translations.

**Preserve formatting** - Rather than stripping formatting and translating plain text, we translate while preserving the document structure. This means your translated content looks just like the original, with the same headings, lists, and emphasis.

## Current Limitations

- DeepL must be configured by an administrator before translations work
- Cannot translate from multiple source languages at once (pick one source language per translation)
- No way to edit translations inline during the translation process—translate first, then edit if needed
- Bulk translation progress is lost if you navigate away and return (translations continue, but you won't see the progress window)
- Cannot resume or retry specific failed translations from the progress window—close and start a new translation
- Very large content items may time out on individual translation (use bulk translation instead)
- Translation uses DeepL glossaries for consistent terminology, but custom glossary edits require updating the glossary files manually
