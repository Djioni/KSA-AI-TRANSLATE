# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

KSA-AI-TRANSLATE is a PowerPoint RTL (Right-to-Left) transformation system for Arabic localization. It consists of:
1. **Three Python agents** that perform deterministic RTL transformations, pixel-based contrast fixes, and optional Vision QA
2. **Node.js/Express REST API** with BullMQ job orchestration (Redis-backed)
3. **Simple CLI tools** for standalone usage

The system performs complex RTL transformations including:
- Mirror positioning of shapes (horizontal flip of X coordinates)
- True paragraph-level RTL enforcement via DrawingML (`a:pPr@rtl="1"`)
- Right-alignment of text
- Horizontal flipping of directional icons/arrows/pictures
- Table column reversal
- Arabic font substitution
- Arabic-Indic digit conversion (0-9 → ٠-٩)
- Pixel-based text contrast measurement and auto-correction (WCAG compliant)
- Optional GPT-4 Vision QA

## Architecture

### Three-Agent Pipeline (Production)

The production system uses BullMQ to orchestrate three sequential agents:

**Agent T (`rtl_pptx_transformer.py`)**: Translation + RTL Transform
- Extracts translation map (`dump-map` mode) OR applies translations + RTL transforms (`transform` mode)
- Mirrors shape positions, flips icons, applies Arabic font/digits, reverses tables
- Output: `rtl.pptx` (intermediate file)

**Agent D (`pixel_contrast_agent.py`)**: Design QA + Pixel Contrast Fixes
- Renders slides to 300 DPI pixels using LibreOffice + PyMuPDF
- Measures foreground/background contrast with Otsu threshold + WCAG formula
- Fixes low-contrast shapes by applying brand colors
- Also handles icon flipping/snapping (idempotent with Agent T)
- Output: `design.pptx` (final file), `audit_pixel.json`

**Agent V (`vision_qa_agent.py`)**: Vision QA (Optional)
- Renders slides to images
- Sends to GPT-4 Vision API for layout validation
- Output: `vision_report.json` (advisory only, non-blocking)

**Job Flow**: `Client → POST /submit → BullMQ Flow (T → D → V) → GET /download/:jobId`

### Standalone CLI Mode

For simple transformations without job queue, use `server/src/server.ts`:
- `POST /dump-map`: Extract text to JSON
- `POST /transform`: Single-shot RTL transform (no queue, synchronous)

### Key Design Patterns

**Coordinate Mirroring**: Shapes are mirrored using `mirror_left(left, width, container_width) → container_width - (left + width)`. Groups are recursively processed using their own width as the container for children.

**Paragraph RTL**: Must be set at XML level (`a:pPr @rtl="1"`), not just alignment. The `ensure_paragraph_rtl()` function enforces this via `pptx.oxml` manipulation.

**Horizontal Flipping**: Uses DrawingML's `a:xfrm @flipH="1"` attribute. Applied to directional shapes (arrows, chevrons, carets) and pictures, except shapes with "logo", "brand", or "qrcode" in their names.

**Translation Key Format**: `slide-{1-indexed}:shape-{shape_id}` for regular shapes, appended with `:table:r{row}c{col}` for table cells.

## Development Commands

### Python CLI (Root Directory)

Activate virtual environment first:
```bash
source .venv/bin/activate
```

Run CLI directly:
```bash
# Dump translation map
python rtl_pptx_transformer.py dump-map input.pptx --out map.json

# Transform with all features
python rtl_pptx_transformer.py transform input.pptx \
  --map map.json \
  --out output_AR.pptx \
  --flip-icons \
  --arabic-font "Noto Naskh Arabic" \
  --arabic-digits

# Transform without contrast fix
python rtl_pptx_transformer.py transform input.pptx \
  --out output_AR.pptx \
  --no-contrast-fix
```

### Node.js API (server/ Directory)

```bash
cd server

# Development - BullMQ orchestrator (production mode)
npm run dev

# Development - Simple API (no queue, for testing)
npm run dev:old

# Build TypeScript
npm run build

# Production (requires build first)
npm start
```

The server runs on port 3000 by default (configurable via `PORT` env var).

**IMPORTANT**: For production, use the orchestrator (`npm run dev`), which requires Redis. For quick tests without Redis, use `npm run dev:old`.

### API Endpoints (Orchestrator - Production)

**POST /submit**: Submit job (returns job ID immediately)
- Upload PPTX (field name: `pptx`)
- Optional translation map (field name: `map`)
- Optional form params: `brandDark`, `brandLight`, `minContrast`, `flipDirectionalIcons`, `snapIcons`, `visionQA`

**GET /status/:jobId**: Check job status (returns manifest with progress)

**GET /download/:jobId**: Download final PPTX (streams `design.pptx`)

**GET /reports/:jobId**: Get all audit/QA reports JSON

**GET /health**: Health check (returns Redis/Python/jobs info)

### API Endpoints (Simple - Testing Only)

**POST /dump-map**: Upload PPTX, returns translation map JSON (synchronous)

**POST /transform**: Upload PPTX with optional map, returns transformed PPTX (synchronous)
- Form params: `flipIcons`, `arabicDigits`, `contrastFix`, `arabicFont`

## Python Environment

Uses Python 3.13 virtual environment at `.venv/`. The API server expects the venv at `../../.venv/bin/python` relative to its `dist/` output directory. Override via `PYTHON_BIN` environment variable.

Required Python packages:
```bash
pip install python-pptx lxml pillow numpy pymupdf openai
```

**Critical Dependencies**:
- `python-pptx` + `lxml`: PPTX XML manipulation (Agent T, D)
- `pillow` + `numpy`: Pixel operations (Agent D)
- `pymupdf` (fitz): PDF rendering at high DPI (Agent D)
- `openai`: GPT-4 Vision API (Agent V)
- LibreOffice: Headless PPTX → PDF rendering (system dependency)

## Important Implementation Details

### Agent Invocation (Critical for Orchestrator)

**Agent T flags** (in `orchestrator.ts` lines 128-139):
```typescript
const args = [
  transformerScript, "transform", inputPptx,
  "--out", outputPptx,
  "--mirror",                          // MUST enable for RTL layout
  "--flip-icons",                      // MUST enable for directional icons
  "--arabic-font", "Noto Naskh Arabic",// MUST specify for Arabic text
  "--arabic-digits",                   // MUST enable for ٠-٩ conversion
  "--no-contrast-fix",                 // MUST disable (Agent D handles this)
];
if (mapJson) args.push("--map", mapJson);
```

**Agent D flags** (in `orchestrator.ts` lines 196-224):
```typescript
const args = [
  pixelContrastScript,
  "--in", inputPptx, "--out", outputPptx,
  "--brand-dark", brandDark || "#0D2A47",
  "--brand-light", brandLight || "#FFFFFF",
  "--min-contrast", minContrast || "4.5",
  "--dpi", "300", "--pad", "6",
  "--audit-out", auditPath,
];
// Icon flipping (enabled by default, idempotent with Agent T)
if (flipDirectionalIcons !== false) args.push("--flip-icons");
// Icon snapping (disabled by default, can break layout)
if (snapIcons === true) args.push("--snap-icons");
```

**WARNING**: Omitting `--mirror` or `--flip-icons` from Agent T will result in LTR layout and wrong icon directions. This was the root cause of the broken state documented in `docs/historical/ARCHITECTURE_BEFORE_FIX_OCT23.md`.

### Pixel Contrast Measurement (Agent D)

Agent D uses **pixel-based measurement** instead of OCR for text contrast:

1. **Render**: PPTX → PDF (LibreOffice) → PNG (PyMuPDF at 300 DPI)
2. **Extract shape region**: Crop pixels using shape bounding box
3. **Segment**: Otsu threshold separates foreground (text) from background
4. **Sample colors**: Mean RGB of top/bottom 40% of histogram
5. **Measure**: WCAG contrast ratio = `(Lmax + 0.05) / (Lmin + 0.05)`
6. **Fix**: If ratio < 4.5, apply brand dark/light color for maximum contrast
7. **Audit**: Write `audit_pixel.json` with before/after ratios + icon actions

**Why not OCR?** Tesseract had 49% confidence on Arabic text with light backgrounds. Pixel measurement is deterministic, language-agnostic, and faster.

### Shape Processing Order (Agent T)
1. Apply translations (replace text)
2. Process tables (reverse columns, enforce RTL)
3. Recurse into groups (using group width as container)
4. Mirror X position in container
5. Enforce RTL on text frames
6. Flip icons/pictures horizontally if enabled

### Icon Detection and Flipping

**Directional icons** (flipped in both Agent T and D):
- Regex: `arrow|chevron|caret|triangle-(?:right|left)|play|next|prev|bullet`
- Mechanism: Set `a:xfrm @flipH="1"` via DrawingML XML

**Logos/brands** (never flipped):
- Regex: `logo|brand|qrcode`
- Always skip flipping to preserve brand identity

**Icon snapping** (Agent D only, opt-in):
- Finds nearest text shape with vertical overlap
- Moves icon to right of text (`text.right + margin`)
- **DISABLED by default** because it can push shapes off slide

### XML Manipulation
The `get_xfrm_element()` function searches multiple XPath locations (`a:xfrm`, `p:spPr/a:xfrm`, `p:grpSpPr/a:xfrm`) before creating one under `p:spPr`. Required for setting `flipH` attribute.

## Testing

No automated tests currently exist. Manual testing workflow:

### Testing Python Agents Directly (Fastest)

```bash
source .venv/bin/activate

# Test Agent T
python rtl_pptx_transformer.py transform input.pptx \
  --out rtl.pptx --mirror --flip-icons \
  --arabic-font "Noto Naskh Arabic" --arabic-digits

# Test Agent D
python pixel_contrast_agent.py \
  --in rtl.pptx --out design.pptx \
  --brand-dark "#0D2A47" --brand-light "#FFFFFF" \
  --min-contrast 4.5 --dpi 300 --pad 6 \
  --flip-icons --audit-out audit.json
```

### Testing Orchestrator API (Production Mode)

```bash
cd server && npm run dev  # Requires Redis

# Submit job
curl -X POST http://localhost:3000/submit \
  -F "pptx=@input.pptx" \
  -F "map=@translations.json"
# Returns: {"jobId": "abc123"}

# Check status
curl http://localhost:3000/status/abc123

# Download result
curl http://localhost:3000/download/abc123 -o output.pptx

# Get audit reports
curl http://localhost:3000/reports/abc123
```

### Verification Checklist (Open in PowerPoint)
- ✅ All text is right-aligned with RTL direction
- ✅ Shapes are horizontally mirrored
- ✅ Arrows/icons point in the correct direction
- ✅ Table columns are reversed (rightmost column first)
- ✅ Arabic font applied (Noto Naskh Arabic)
- ✅ Arabic-Indic digits displayed (٠-٩ not 0-9)
- ✅ Low-contrast text fixed (check audit_pixel.json)
- ✅ No significant overlaps or off-slide shapes

## Common Issues and Solutions

### Content Disappearing After Transform
**Cause:** Empty string values in the translation map cause shapes to be cleared.
**Solution:** Remove keys with empty values from the JSON map, or provide actual translation text. Only include keys you want to translate.

Example of problematic map:
```json
{
  "slide-1:shape-30": "",  // ← This will clear the shape
  "slide-1:shape-31": "Valid text"  // ← This is fine
}
```

### Text Invisible or Low Contrast
**Cause:** Background/foreground colors too similar (ratio < 4.5:1).
**Solution:** Agent D automatically fixes this using pixel-based measurement. Check `audit_pixel.json` to see which shapes were fixed and their before/after ratios. If you want to disable this, set `minContrast` to a very low value like `1.0`.

### Translation Not Applied
**Cause:** Shape IDs in the translation map don't match the actual PPTX. This happens if you:
- Used a map from a different PPTX file
- The PPTX was modified after generating the map
- Manual typos in shape IDs

**Solution:** Always regenerate the map from the exact PPTX you're transforming:
```bash
# API
curl -f -X POST http://localhost:3000/dump-map \
  -F 'pptx=@/path/to/exact-file.pptx' \
  -o fresh_map.json

# CLI
python rtl_pptx_transformer.py dump-map exact-file.pptx --out fresh_map.json
```

### Server Can't Find Python
**Cause:** `PYTHON_BIN` environment variable not set or points to wrong location.
**Solution:** Always set before starting server:
```bash
export PYTHON_BIN="/absolute/path/to/KSA-AI-TRANSLATE/.venv/bin/python"
```

The server logs show which Python it's using on startup: `Using Python: /path/...`

### "npm run dev" Fails with ENOENT
**Cause:** Running `npm` commands from wrong directory. The `package.json` is in `server/`, not root.
**Solution:** Always `cd server` before running npm commands.

### Redis Connection Failed (Orchestrator)
**Cause:** BullMQ requires Redis, which may not be running.
**Solution:**
```bash
# macOS (install if needed)
brew install redis
brew services start redis

# Linux
sudo systemctl start redis

# Test connection
redis-cli ping  # Should return "PONG"
```
If you don't want to use Redis, use the simple API instead: `npm run dev:old`

### LibreOffice Not Found (Agent D)
**Cause:** Agent D requires LibreOffice for PPTX → PDF rendering.
**Solution:**
```bash
# macOS
brew install --cask libreoffice

# Linux
sudo apt install libreoffice
```
Agent D looks for `soffice` in PATH. If custom location, set env var:
```bash
export LIBREOFFICE_BIN="/Applications/LibreOffice.app/Contents/MacOS/soffice"
```

### Missing Flags Cause Features Not Working
**Symptom:** Shapes not mirrored, icons pointing wrong direction, still using English font.
**Cause:** Agent T invocation missing critical flags (`--mirror`, `--flip-icons`, `--arabic-font`, `--arabic-digits`).
**Solution:** Check `server/src/orchestrator.ts` lines 128-139 and ensure all flags are present. See "Agent Invocation (Critical for Orchestrator)" section above.

## Recommended Workflow for New Slides

### For Development/Testing (Fast Iteration)

Use Python CLI directly:
```bash
source .venv/bin/activate

# Step 1: Extract translation map
python rtl_pptx_transformer.py dump-map input.pptx --out map.json

# Step 2: Edit map.json (add Arabic translations)

# Step 3: Transform (all features enabled)
python rtl_pptx_transformer.py transform input.pptx \
  --map map.json --out rtl.pptx \
  --mirror --flip-icons \
  --arabic-font "Noto Naskh Arabic" --arabic-digits

# Step 4: Fix contrast
python pixel_contrast_agent.py \
  --in rtl.pptx --out final.pptx \
  --brand-dark "#0D2A47" --brand-light "#FFFFFF" \
  --flip-icons --audit-out audit.json

# Step 5: Open final.pptx in PowerPoint and verify
```

### For Production (Full Pipeline)

Use orchestrator API:
```bash
cd server && npm run dev  # Start server with Redis

# Submit job
curl -X POST http://localhost:3000/submit \
  -F "pptx=@input.pptx" \
  -F "map=@translations.json" \
  -F "brandDark=#0D2A47" \
  -F "brandLight=#FFFFFF" \
  -F "visionQA=false"
# Returns: {"jobId": "abc123"}

# Poll status until completed
curl http://localhost:3000/status/abc123

# Download when ready
curl http://localhost:3000/download/abc123 -o output.pptx
```

### Troubleshooting Bad Results

If output looks wrong, check in this order:

1. **Missing translations**: Shapes still in English?
   - Regenerate map.json from the exact input file
   - Verify map keys match shape IDs

2. **Wrong layout**: Shapes not mirrored?
   - Check `orchestrator.ts` has `--mirror` flag for Agent T
   - See "Missing Flags Cause Features Not Working" above

3. **Icons pointing wrong way**:
   - Verify icon names match regex: `arrow|chevron|caret|play|next|prev`
   - Check `audit_pixel.json` to see if icons were detected

4. **Low contrast text**:
   - Check `audit_pixel.json` for shapes with `fixed_contrast: true`
   - Verify before/after ratios (should go from <4.5 to >7.0)

5. **Vision QA issues**:
   - Enable Vision QA: `visionQA=true`
   - Check `vision_report.json` for GPT-4's analysis
   - Requires `OPENAI_API_KEY` environment variable

## Key Files and Their Purpose

### Python Agents (Root Directory)
- `rtl_pptx_transformer.py` (437 lines): Agent T - Core RTL transformation engine
- `pixel_contrast_agent.py` (499 lines): Agent D - Pixel-based contrast measurement + icon features
- `vision_qa_agent.py` (200+ lines): Agent V - GPT-4 Vision QA (optional)
- `designer_agent.py`: **DEPRECATED** - replaced by pixel_contrast_agent.py (Oct 2025)

### Node.js Server (server/src/)
- `orchestrator.ts`: **Production API** - BullMQ-based job orchestration (use this)
- `server.ts`: Simple API - No queue, synchronous transforms (testing only)
- `package.json`: Dependencies (express, bullmq, multer, nanoid, ioredis)

### Documentation
- `CLAUDE.md`: **This file** - Instructions for Claude Code
- `ARCHITECTURE.md`: Complete architecture documentation (33KB, production-ready)
- `docs/historical/ARCHITECTURE_BEFORE_FIX_OCT23.md`: Historical analysis showing broken state before fixes

### Job Output Structure
```
jobs/<jobId>/
├── manifest.json         # Job metadata, status, errors, output paths
├── input.pptx           # Original uploaded file
├── map.json             # Translation map (if provided)
├── rtl.pptx             # After Agent T (intermediate)
├── design.pptx          # After Agent D (final output)
├── audit_pixel.json     # Contrast + icon audit from Agent D
└── vision_report.json   # GPT-4 Vision QA from Agent V (if enabled)
```

## Historical Context

**October 2025 Architecture Improvement**: The system originally had only 4 out of 12 features working (33%) due to missing flags in the orchestrator and loss of icon features when replacing OCR with pixel contrast. The "Option B" implementation (documented in `OPTION_B_IMPLEMENTATION_COMPLETE.md`) fixed this by:

1. Adding missing flags to Agent T (`--mirror`, `--flip-icons`, `--arabic-font`, `--arabic-digits`)
2. Porting icon features from `designer_agent.py` to `pixel_contrast_agent.py`
3. Replacing unreliable Tesseract OCR with deterministic pixel-based contrast measurement

**Result**: 11 out of 11 features now working (100%). See `docs/historical/ARCHITECTURE_BEFORE_FIX_OCT23.md` for details on the broken state.

## Environment Variables

```bash
# Required for orchestrator (production)
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# Required for Agent V (Vision QA)
OPENAI_API_KEY=sk-...

# Optional overrides
PYTHON_BIN=/path/to/.venv/bin/python
LIBREOFFICE_BIN=/path/to/soffice
PORT=3000
JOBS_DIR=/path/to/jobs
```
