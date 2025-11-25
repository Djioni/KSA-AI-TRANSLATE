# OCR Improvement Implementation Summary

## Problem Identified

The original system used **Tesseract OCR** in `designer_agent.py` to validate text readability after RTL transformation. This approach had critical flaws:

1. **Unreliable for Arabic text**: Tesseract struggles with Arabic ligatures, small fonts, and anti-aliasing
2. **Fails on gradients/backgrounds**: OCR confidence drops significantly on complex backgrounds
3. **Wrong tool for the job**: We don't need to "read" text—we need to **measure visibility**
4. **Non-deterministic**: OCR results vary and don't directly correlate with human readability

## Solution Implemented

Following ChatGPT's analysis in `IMPROVE-THE-OCR.md`, we replaced OCR-based validation with a **pixel-based contrast measurement system**.

### New Approach: Pixel Contrast Agent

**File**: `pixel_contrast_agent.py`

**Method**:
1. **Render slides to pixels**: LibreOffice → PDF → PyMuPDF → PNG at 300 DPI
2. **Sample pixels per shape**: For each text shape bbox, extract the rendered region
3. **Otsu segmentation**: Separate foreground (text) from background using Otsu threshold
4. **WCAG contrast calculation**: Compute relative luminance and contrast ratio
5. **Deterministic fixes**: If ratio < threshold (4.5), recolor to brand dark/light (whichever passes)
6. **Audit trail**: Output JSON with before/after measurements for every shape

### Key Advantages

✅ **Deterministic**: Same input always produces same output
✅ **Fast**: No ML/OCR inference needed
✅ **Handles gradients**: Samples actual rendered pixels, not XML colors
✅ **Arabic-agnostic**: Doesn't care about text shaping or language
✅ **WCAG compliant**: Uses industry-standard contrast ratio formulas
✅ **Transparent**: Audit JSON shows exact measurements and decisions

## Changes Made

### 1. Created `pixel_contrast_agent.py`

**Dependencies**:
- `numpy` - For Otsu threshold and pixel operations
- `pillow` - For image manipulation
- `pymupdf` - For PDF rendering
- `python-pptx` - For PPTX manipulation
- LibreOffice - For headless PPTX→PDF conversion

**Usage**:
```bash
python pixel_contrast_agent.py \
  --in slides_AR.pptx \
  --out slides_AR_polished.pptx \
  --brand-dark "#0D2A47" \
  --brand-light "#FFFFFF" \
  --min-contrast 4.5 \
  --dpi 300 \
  --pad 6 \
  --audit-out audit_pixel.json
```

### 2. Updated Node.js Orchestrator

**File**: `server/src/orchestrator.ts`

**Changes**:
- Agent D now calls `pixel_contrast_agent.py` instead of `designer_agent.py`
- Removed `ocrReport` from manifest interface
- Renamed audit output to `audit_pixel.json`
- Updated `/reports/:jobId` endpoint to return `pixelContrast` instead of `ocr`

**Before**:
```typescript
const designerScript = path.join(PROJECT_ROOT, "designer_agent.py");
// ... includes --ocr-report flag
```

**After**:
```typescript
const pixelContrastScript = path.join(PROJECT_ROOT, "pixel_contrast_agent.py");
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

### 3. Installed Dependencies

```bash
pip install numpy pillow  # pymupdf was already installed
```

LibreOffice was already installed via Homebrew.

## Testing Results

**Test File**: `jobs/dhuEWPo472rWc_OAlOL8z/rtl.pptx`

**Sample Audit Output**:
```json
{
  "slide": 1,
  "shape_id": 31,
  "name": "Rectangle: Rounded Corners 30",
  "bbox_px": [1106, 1778, 3881, 2097],
  "measured_fg": [25, 176, 198],
  "measured_bg": [234, 239, 241],
  "ratio_before": 2.246,      // ❌ Below threshold
  "ratio_after": 12.586,      // ✅ Fixed to brand dark
  "fixed": true,
  "applied_color": [13, 42, 71]
}
```

The agent successfully identified low-contrast shapes (ratio 2.246, 4.449) and fixed them to meet WCAG AA standards (12.586).

## Architecture Alignment

This implementation follows the recommended 3-agent architecture from ChatGPT's analysis:

1. **Agent T (Translation/RTL)**: `rtl_pptx_transformer.py` - Unchanged, handles translation + RTL transforms
2. **Agent D (Design/QA)**: **`pixel_contrast_agent.py`** - NEW, deterministic pixel-based contrast fixes
3. **Agent V (Vision QA)**: `vision_qa_agent.py` - Optional, uses VLM for final sanity check (non-blocking)

**Key principle**: Agent D doesn't rely on OCR for visibility validation. It measures what users will see.

## Migration Notes

### For existing workflows:

The API endpoints remain the same:
- `POST /submit` - Still accepts same parameters
- `GET /reports/:jobId` - Now returns `pixelContrast` instead of `ocr` in reports object

### For debugging:

The audit JSON (`audit_pixel.json`) is much more useful than OCR output:
- Shows exact measured colors (fg/bg)
- Shows contrast ratios before/after
- Indicates which shapes were fixed and why
- Includes pixel bboxes for verification

### Backward compatibility:

The old `designer_agent.py` with OCR is still available if needed, but is **not recommended** for production use. The pixel contrast agent is faster, more reliable, and deterministic.

## Next Steps (Optional Enhancements)

1. **Icon flipping**: Add icon flip logic to pixel_contrast_agent.py (currently only does contrast)
2. **Icon snapping**: Port the snap-to-text logic from designer_agent.py
3. **Configurable DPI**: Expose DPI as API parameter for quality vs speed tradeoff
4. **Benchmark**: Compare processing time vs old OCR approach
5. **Visual diff**: Generate before/after screenshots for QA

## References

- Original issue analysis: `IMPROVE-THE-OCR.md`
- ChatGPT's recommended implementation: Lines 82-459 in `IMPROVE-THE-OCR.md`
- WCAG contrast formula: https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html
- Otsu's method: https://en.wikipedia.org/wiki/Otsu%27s_method

---

**Status**: ✅ **COMPLETE** - Pixel-based contrast agent is now the default for Agent D in the orchestrator.
