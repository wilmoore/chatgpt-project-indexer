# Bug Fix: Project Title Extraction from Popup

## Bug Report

**Reported**: 2025-12-29
**Severity**: High (degraded experience - violates PRD requirements)

### Steps to Reproduce

1. Run the ChatGPT Project Indexer: `npm start`
2. Let it enumerate projects via the "See more" popup
3. Check captured titles in `projects.json` or Supabase

### Expected Behavior

Titles should match tooltip-expanded text with proper casing and delimiters:
- Example: `Sunrise Fuel :: CaptionsAI`

### Actual Behavior

Titles are lowercase with spaces, derived from URL slugs:
- Example: `sunrise fuel captionsai`

### Environment

- Branch: `fix/project-title-extraction-from-popup`
- Platform: macOS Darwin 25.1.0
- Node: v23.9.0

## Root Cause Analysis

### Code Path

`src/scraper/extractor.ts` → `extractProjectsFromPopup()` (lines 11-79)

### Problem

When extracting from the popup, the code:
1. Tries to get `innerText` from the anchor element (lines 40-48)
2. If empty or >200 chars, falls back to URL slug parsing (lines 51-53)

```typescript
const slugMatch = id.match(/g-p-[a-z0-9]+-(.+)$/);
title = slugMatch ? slugMatch[1].replace(/-/g, ' ') : id;
```

URL slugs are **always lowercase** (e.g., `sunrise-fuel-captionsai`), losing:
- Original capitalization
- Special delimiters (`::`, `|`, etc.)

### Why innerText Fails

ChatGPT truncates visible text in the popup list items. The full title is stored in the `title` attribute of the anchor element, but the popup extraction code doesn't read it.

### PRD Violations

- **DP-04**: "Truncated or inferred data is unacceptable"
- **Success criteria**: "Full titles match tooltip-expanded text"
- **Failure criteria**: "Truncated titles"

## Fix

Add `title` attribute extraction before falling back to slug:

```typescript
// Get title attribute first (has full proper-cased title)
const titleAttr = await item.getAttribute('title');

// Priority: titleAttr > innerText > slug fallback
```

## Verification Plan

1. Re-run scraper against ChatGPT
2. Verify "Sunrise Fuel :: CaptionsAI" captured correctly
3. Spot-check other projects for proper casing/delimiters
4. Update existing Supabase data with corrected titles
