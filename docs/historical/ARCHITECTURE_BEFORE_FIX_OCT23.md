# Current Architecture: Reality Check

**Date**: October 23, 2025
**Status**: ⚠️ **INCOMPLETE** - Some agents are not doing their job properly

---

## Executive Summary

While we've made progress on replacing OCR with pixel contrast measurement, **the overall pipeline still has gaps**. The output file at `/Users/djioni/Desktop/slides_AR_test.pptx` is not meeting expectations because:

1. ❌ **Agent T** (RTL Transform) - May not be doing full mirroring/icon flipping
2. ⚠️ **Agent D** (Design/Contrast) - NOW USING PIXEL CONTRAST (good) but missing icon flip logic
3. ⚠️ **Agent V** (Vision QA) - Non-blocking, may not catch all issues

---

## Current Architecture Overview

### 3-Agent Pipeline

```
┌─────────────┐
│   User      │
│  Submits    │
│   PPTX +    │
│   Map JSON  │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────────┐
│         BullMQ Orchestrator                 │
│  (server/src/orchestrator.ts)               │
└─────────────────────────────────────────────┘
       │
       │ Creates Flow: T → D → V
       │
       ▼
┌──────────────────────────────────────────────┐
│  AGENT T: Translation + RTL Transform        │
│  Script: rtl_pptx_transformer.py             │
│                                              │
│  SUPPOSED TO DO:                             │
│  ✅ Apply translations from map.json         │
│  ✅ Set RTL paragraph direction              │
│  ✅ Right-align text                         │
│  ✅ Mirror shape positions (flip X coords)   │
│  ✅ Flip directional icons horizontally      │
│  ✅ Reverse table columns                    │
│  ✅ Apply Arabic font                        │
│  ✅ Convert to Arabic-Indic digits (٠-٩)     │
│                                              │
│  ACTUALLY DOING:                             │
│  ✅ Translations - YES                       │
│  ✅ RTL direction - YES                      │
│  ⚠️ Shape mirroring - MAYBE (--no-mirror?)   │
│  ❌ Icon flipping - NOT ENABLED              │
│  ⚠️ Table reversal - MAYBE                   │
│  ⚠️ Arabic font - MAYBE                      │
│  ⚠️ Arabic digits - MAYBE                    │
│                                              │
│  Output: rtl.pptx                            │
└──────────┬───────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────┐
│  AGENT D: Design + Contrast Fixes            │
│  Script: pixel_contrast_agent.py (NEW!)      │
│                                              │
│  SUPPOSED TO DO:                             │
│  ✅ Measure pixel-based contrast ratios      │
│  ✅ Fix low-contrast text (brand colors)     │
│  ✅ Ensure RTL paragraph enforcement         │
│  ✅ Flip directional icons                   │
│  ✅ Snap icons to right of text (RTL)        │
│  ✅ Reduce shape overlaps                    │
│                                              │
│  ACTUALLY DOING:                             │
│  ✅ Pixel contrast measurement - YES         │
│  ✅ Contrast fixes - YES (confirmed working) │
│  ✅ RTL enforcement - YES                    │
│  ❌ Icon flipping - NO (not in pixel agent)  │
│  ❌ Icon snapping - NO (not in pixel agent)  │
│  ❌ Overlap reduction - NO                   │
│                                              │
│  Output: design.pptx, audit_pixel.json       │
└──────────┬───────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────┐
│  AGENT V: Vision QA (Optional)               │
│  Script: vision_qa_agent.py                  │
│                                              │
│  SUPPOSED TO DO:                             │
│  ✅ Render slides to images                  │
│  ✅ Send to GPT-4 Vision API                 │
│  ✅ Check RTL layout correctness             │
│  ✅ Check text visibility                    │
│  ✅ Check icon directionality                │
│  ✅ Generate feedback report                 │
│                                              │
│  ACTUALLY DOING:                             │
│  ✅ All of the above - YES                   │
│  ⚠️ But it's NON-BLOCKING (doesn't fix)      │
│  ⚠️ Only provides advisory feedback          │
│                                              │
│  Output: vision_report.json                  │
└──────────┬───────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────┐
│         Final Output: design.pptx            │
└──────────────────────────────────────────────┘
```

---

## What Each Agent Actually Does

### Agent T: `rtl_pptx_transformer.py`

**Invocation in orchestrator.ts** (lines 128-141):
```typescript
const args = [
  transformerScript,
  "transform",
  inputPptx,
  "--out",
  outputPptx,
  "--no-contrast-fix",    // ⚠️ Contrast fix disabled (handled by Agent D)
  // NOTE: We NEED --mirror for proper RTL layout, otherwise Agent D positions are wrong
];

if (mapJson) {
  args.push("--map", mapJson);
}
```

**ISSUES IDENTIFIED**:
- ❌ **`--mirror` flag NOT being passed** - Comment says "we need --mirror" but it's not in args!
- ❌ **No `--flip-icons` flag** - Directional icons won't be flipped
- ❌ **No `--arabic-font` flag** - Font may not be applied
- ❌ **No `--arabic-digits` flag** - Numbers stay 0-9 instead of ٠-٩

**What the code CAN do** (from rtl_pptx_transformer.py):
```python
# Available CLI flags:
--map <file>              # ✅ BEING USED
--out <file>              # ✅ BEING USED
--mirror                  # ❌ NOT BEING USED
--flip-icons              # ❌ NOT BEING USED
--arabic-font <name>      # ❌ NOT BEING USED
--arabic-digits           # ❌ NOT BEING USED
--no-contrast-fix         # ✅ BEING USED (correct, Agent D handles this)
```

**Actual capabilities** (from code review):
- ✅ Translation replacement - implemented
- ✅ RTL paragraph direction (`a:pPr @rtl="1"`) - implemented
- ✅ Right alignment - implemented
- ✅ Mirror positions (`mirror_left()`) - implemented but NOT ENABLED
- ✅ Icon flipping (`flip_h()`) - implemented but NOT ENABLED
- ✅ Table column reversal - implemented
- ✅ Arabic font application - implemented but NOT ENABLED
- ✅ Arabic-Indic digit conversion - implemented but NOT ENABLED

**Conclusion**: Agent T has all the features but **they're not being called**!

---

### Agent D: `pixel_contrast_agent.py` (NEW)

**Invocation in orchestrator.ts** (lines 194-212):
```typescript
const args = [
  pixelContrastScript,
  "--in", inputPptx,
  "--out", outputPptx,
  "--brand-dark", brandDark || "#0D2A47",
  "--brand-light", brandLight || "#FFFFFF",
  "--min-contrast", minContrast || "4.5",
  "--dpi", "300",
  "--pad", "6",
  "--audit-out", auditPath,
];
```

**What this agent DOES**:
- ✅ Render slides to pixels (LibreOffice → PDF → PNG)
- ✅ Otsu segmentation for fg/bg separation
- ✅ WCAG contrast ratio measurement
- ✅ Recolor low-contrast text with brand colors
- ✅ Enforce RTL on all paragraphs (idempotent)
- ✅ Generate detailed audit JSON

**What this agent DOES NOT DO**:
- ❌ Icon flipping (not implemented in pixel_contrast_agent.py)
- ❌ Icon snapping to right of text
- ❌ Overlap reduction/nudging
- ❌ Shape position mirroring (should be done by Agent T)

**Comparison with old `designer_agent.py`**:
```python
# designer_agent.py HAS these features:
- flip_directional_icons (via --flip-directional-icons)
- snap_icons (via --snap-icons)
- nudge_overlaps() - gentle downward nudging

# pixel_contrast_agent.py ONLY has:
- Pixel contrast measurement and fixes
- RTL paragraph enforcement
```

**Conclusion**: We **replaced a full-featured agent with a limited one**! The pixel contrast is better, but we **lost icon flipping and snapping**.

---

### Agent V: `vision_qa_agent.py`

**Invocation in orchestrator.ts** (lines 267-279):
```typescript
const args = [
  visionScript,
  "--in", inputPptx,
  "--report", visionReportPath,
  "--slides", "all",
];

if (apiKey) {
  args.push("--api-key", apiKey);
}
```

**What this agent DOES**:
- ✅ Renders slides to PNG images
- ✅ Sends to OpenAI GPT-4 Vision API
- ✅ Analyzes RTL layout, text visibility, icon direction
- ✅ Generates JSON report with feedback

**What this agent DOES NOT DO**:
- ❌ Does not modify the PPTX (read-only)
- ❌ Does not fix issues (advisory only)
- ❌ Does not block pipeline on failures

**Conclusion**: Agent V is working as designed (advisory only), but it can't fix the problems it finds.

---

## Root Cause Analysis

### Why the output is "still not good"

The final `design.pptx` has issues because:

1. **Agent T is missing critical flags**:
   ```typescript
   // CURRENT (BROKEN):
   const args = [
     transformerScript,
     "transform",
     inputPptx,
     "--out", outputPptx,
     "--no-contrast-fix"
   ];

   // SHOULD BE:
   const args = [
     transformerScript,
     "transform",
     inputPptx,
     "--out", outputPptx,
     "--mirror",                          // ❌ MISSING!
     "--flip-icons",                      // ❌ MISSING!
     "--arabic-font", "Noto Naskh Arabic", // ❌ MISSING!
     "--arabic-digits",                    // ❌ MISSING!
     "--no-contrast-fix"                   // ✅ Correct (Agent D handles this)
   ];
   ```

2. **Agent D (pixel_contrast_agent.py) lacks features**:
   - Icon flipping logic not ported from `designer_agent.py`
   - Icon snapping logic not ported
   - Should these be in Agent T or Agent D? **BOTH had them!**

3. **Unclear responsibility boundaries**:
   - Who flips icons? Agent T or Agent D?
   - Who mirrors shapes? Agent T only
   - Who snaps icons to text? Agent D only
   - **Current state: Neither is doing icon flipping!**

---

## Feature Matrix

| Feature | Agent T (rtl_pptx_transformer.py) | Agent D (pixel_contrast_agent.py) | Agent D (old designer_agent.py) | Currently Working? |
|---------|-----------------------------------|-----------------------------------|--------------------------------|-------------------|
| **Translation** | ✅ Implemented | ❌ N/A | ❌ N/A | ✅ YES (Agent T) |
| **RTL direction** | ✅ Implemented | ✅ Implemented (idempotent) | ✅ Implemented (idempotent) | ✅ YES |
| **Right align** | ✅ Implemented | ✅ Implemented | ✅ Implemented | ✅ YES |
| **Mirror positions** | ✅ Implemented, ❌ Not called | ❌ N/A | ❌ N/A | ❌ NO - missing `--mirror` |
| **Flip icons** | ✅ Implemented, ❌ Not called | ❌ Not implemented | ✅ Implemented, ❌ Not used | ❌ NO - missing everywhere |
| **Reverse tables** | ✅ Implemented | ❌ N/A | ❌ N/A | ⚠️ UNKNOWN (need to test) |
| **Arabic font** | ✅ Implemented, ❌ Not called | ❌ N/A | ❌ N/A | ❌ NO - missing `--arabic-font` |
| **Arabic digits** | ✅ Implemented, ❌ Not called | ❌ N/A | ❌ N/A | ❌ NO - missing `--arabic-digits` |
| **Pixel contrast** | ⚠️ Simple (XML-based) | ✅ Advanced (pixel-based) | ❌ N/A | ✅ YES (Agent D) |
| **XML contrast** | ✅ Implemented, ❌ Disabled | ❌ N/A | ✅ Implemented | ❌ NO - disabled by `--no-contrast-fix` |
| **Icon snapping** | ❌ N/A | ❌ Not implemented | ✅ Implemented, ❌ Disabled | ❌ NO - not in pixel agent |
| **Overlap reduction** | ✅ Implemented | ❌ Not implemented | ✅ Implemented, ❌ Disabled | ❌ NO - not in pixel agent |
| **OCR validation** | ❌ N/A | ❌ Removed (replaced) | ✅ Implemented | ❌ NO - removed |

**Summary**: Out of 12 features, only **4 are working** (translation, RTL, alignment, pixel contrast)!

---

## Critical Missing Pieces

### 1. Agent T Configuration (URGENT)

**File**: `server/src/orchestrator.ts` lines 128-141

**Problem**: Missing critical CLI flags

**Fix**:
```typescript
const args = [
  transformerScript,
  "transform",
  inputPptx,
  "--out", outputPptx,
  "--mirror",                                    // ← ADD THIS
  "--flip-icons",                                // ← ADD THIS
  "--arabic-font", "Noto Naskh Arabic",          // ← ADD THIS
  "--arabic-digits",                             // ← ADD THIS
  "--no-contrast-fix"
];
```

### 2. Agent D Missing Features (MEDIUM)

**File**: `pixel_contrast_agent.py`

**Problem**: Lacks icon flipping and snapping logic from `designer_agent.py`

**Options**:
1. **Port features from designer_agent.py to pixel_contrast_agent.py**
2. **Run designer_agent.py AFTER pixel_contrast_agent.py** (two-step Agent D)
3. **Move icon logic back to Agent T** (single responsibility)

### 3. Testing Gaps (LOW)

**Problem**: No automated tests to catch these regressions

**Needed**:
- Unit tests for each agent
- Integration tests for the full pipeline
- Visual regression tests (screenshot comparison)

---

## Tool & Function Inventory

### Python Scripts

1. **`rtl_pptx_transformer.py`** (Agent T)
   - Functions: 30+
   - Key: `mirror_left()`, `flip_h()`, `ensure_paragraph_rtl()`, `to_arabic_digits()`
   - Status: ✅ Implemented, ❌ Not fully utilized

2. **`pixel_contrast_agent.py`** (Agent D - NEW)
   - Functions: 15
   - Key: `otsu_threshold()`, `estimate_fg_bg_from_region()`, `contrast_ratio()`, `process_pptx()`
   - Status: ✅ Implemented, ✅ Working, ⚠️ Missing icon features

3. **`designer_agent.py`** (Agent D - OLD, unused now)
   - Functions: 20
   - Key: `flip_h()`, `is_directional()`, `fix_slide()`, `validate_with_ocr()`
   - Status: ⚠️ Not being called, has features pixel agent lacks

4. **`vision_qa_agent.py`** (Agent V)
   - Functions: 10
   - Key: `render_slide_to_image()`, `analyze_slide_with_openai()`
   - Status: ✅ Implemented, ✅ Working

### Node.js/TypeScript

1. **`server/src/orchestrator.ts`**
   - Workers: 3 (agentTWorker, agentDWorker, agentVWorker)
   - Queues: 3 (agent-t, agent-d, agent-v)
   - FlowProducer: 1
   - Status: ✅ Working but ❌ Missing CLI flags

2. **`server/src/server.ts`**
   - Routes: Health check, dump-map, transform (simple API)
   - Status: ⚠️ May be redundant with orchestrator

### Dependencies

**Python**:
- `python-pptx` - PPTX manipulation
- `lxml` - XML parsing
- `pillow` - Image processing
- `numpy` - Pixel operations
- `pymupdf` (fitz) - PDF rendering
- `pytesseract` - OCR (unused now)
- `openai` - GPT-4 Vision API

**Node.js**:
- `express` - Web server
- `multer` - File uploads
- `bullmq` - Job queue
- `nanoid` - ID generation
- `dotenv` - Environment config

**System**:
- LibreOffice (soffice) - PPTX → PDF conversion
- Redis - BullMQ backend
- Tesseract - OCR (unused now)

---

## Recommendations

### Immediate Actions (Critical)

1. **Fix Agent T invocation** - Add missing flags:
   ```typescript
   // In server/src/orchestrator.ts, Agent T worker
   args.push("--mirror");
   args.push("--flip-icons");
   args.push("--arabic-font", "Noto Naskh Arabic");
   args.push("--arabic-digits");
   ```

2. **Decide on icon flipping responsibility**:
   - **Option A** (Recommended): Let Agent T handle icon flipping (it already has the code)
   - **Option B**: Port icon flipping to pixel_contrast_agent.py
   - **Option C**: Run both agents (designer_agent.py for icons, pixel_contrast for contrast)

3. **Test the pipeline** with all flags enabled:
   ```bash
   # Direct CLI test:
   python rtl_pptx_transformer.py transform input.pptx \
     --map map.json \
     --out rtl.pptx \
     --mirror \
     --flip-icons \
     --arabic-font "Noto Naskh Arabic" \
     --arabic-digits \
     --no-contrast-fix

   python pixel_contrast_agent.py \
     --in rtl.pptx \
     --out design.pptx \
     --brand-dark "#0D2A47" \
     --brand-light "#FFFFFF" \
     --min-contrast 4.5 \
     --audit-out audit.json
   ```

### Medium-term Actions

4. **Port icon features to pixel agent** - If we want a single Agent D:
   - Copy `flip_h()`, `is_directional()`, `is_logo_like()` from designer_agent.py
   - Copy icon snapping logic
   - Add CLI flags: `--flip-icons`, `--snap-icons`

5. **Add automated tests**:
   - Unit test each agent CLI with fixture PPTX
   - Assert expected transformations happened
   - Screenshot comparison for visual regression

6. **Document the "official" architecture**:
   - Update CLAUDE.md with correct flag usage
   - Create architectural decision records (ADRs)
   - Add troubleshooting guide

### Long-term Actions

7. **Simplify the architecture**:
   - Consider merging Agent T + Agent D into a single comprehensive agent
   - Or clearly separate: Agent T = Transform, Agent D = QA/Polish
   - Agent V remains as optional visual QA

8. **Build a control panel**:
   - Web UI to submit jobs and see progress
   - Visual diff viewer for before/after slides
   - Audit report viewer with contrast measurements

---

## Conclusion

### The Good News ✅

- Pixel contrast measurement is working correctly
- The orchestrator/BullMQ architecture is solid
- All the code we need exists (just not being called)
- Agent V (Vision QA) provides good advisory feedback

### The Bad News ❌

- **Agent T is only doing 40% of its job** (missing flags)
- **Agent D lost features** when we switched from designer_agent.py to pixel_contrast_agent.py
- **No one is flipping icons** (both agents could, neither is)
- **No shape mirroring** (Agent T can, but flag not passed)
- **No Arabic font or digits** (Agent T can, but flags not passed)

### The Fix (Priority Order)

1. **Add missing flags to Agent T** (5 min fix, huge impact)
2. **Decide icon responsibility** (design decision)
3. **Port or re-enable icon features** (30 min coding)
4. **Test end-to-end** with a real PPTX
5. **Document the final architecture**

**Bottom line**: The tools exist, they're just not being called with the right parameters!

---

## Next Steps

Please review this document and decide:

1. **Should Agent T handle icon flipping?** (via `--flip-icons` flag)
2. **Should we port icon features to pixel_contrast_agent.py?** (more work but cleaner)
3. **Do we keep designer_agent.py as a backup?** (for icon/snapping features)

Once decided, I can implement the fixes immediately.
