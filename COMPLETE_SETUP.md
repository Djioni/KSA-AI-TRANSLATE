# Complete Three-Agent Setup Guide

## Overview: The Three-Agent Architecture

Your RTL Arabic slide transformation now uses **three specialized agents** working in sequence:

```
Input PPTX
    ↓
┌─────────────────────────────────────────┐
│ AGENT T (Translation + RTL)             │
│ - Translates English → Arabic           │
│ - Sets RTL paragraph direction          │
│ - Right-aligns text                     │
│ - Applies Arabic font                   │
└─────────────────────────────────────────┘
    ↓ rtl.pptx
┌─────────────────────────────────────────┐
│ AGENT D (Designer + OCR)                │
│ - Fixes white-on-white text             │
│ - Re-enforces RTL (idempotent)          │
│ - Snaps icons to RIGHT of text          │
│ - Flips directional icons               │
│ - OCR validation (optional)             │
└─────────────────────────────────────────┘
    ↓ design.pptx
┌─────────────────────────────────────────┐
│ AGENT V (Vision QA with Claude)         │
│ - Visual analysis of each slide         │
│ - Scores: text visibility, RTL layout   │
│ - Detects: positioning, spacing issues  │
│ - Provides: recommendations             │
└─────────────────────────────────────────┘
    ↓ final.pptx + QA reports
```

## Agent Communication Protocol

**Question:** "How do agents talk to each other?"

**Answer:** They don't! It's a **file-based pipeline**:

1. Agent T writes `rtl.pptx`
2. Agent D reads `rtl.pptx`, writes `design.pptx`
3. Agent V reads `design.pptx`, writes `vision_report.json`

The "protocol" is the **PPTX file format** itself. Each agent:
- Runs as an independent Python subprocess
- Reads PPTX XML using `python-pptx`
- Modifies shapes/paragraphs/colors
- Writes output PPTX
- Exits

No inter-process communication, no message passing, no sockets.

## Why Each Agent Exists

### Agent T: Why Not Fix Colors Here?

Agent T's job is **content transformation only**:
- Replace text (translation)
- Set paragraph properties (RTL, alignment)
- Optional: mirror positions (usually disabled)

**Why no color fixes?** Because Agent T doesn't know your brand colors. It would need to guess or use hardcoded values. Better to separate concerns.

### Agent D: Why Not Use Vision?

Agent D uses **deterministic XML analysis**:
```python
bg_color = shape.fill.fore_color.rgb  # From XML
text_color = run.font.color.rgb        # From XML
contrast = calculate_contrast(bg, text)

if contrast < 4.5:
    # Fix it
```

**Advantages:**
- Fast (1-2 seconds)
- No API costs
- Works offline
- Deterministic results

**Limitations:**
- Can't detect gradient backgrounds (only base color in XML)
- Can't verify final rendered appearance
- Assumes XML values are accurate

**OCR validation (optional):** Renders slide to PNG, runs Tesseract OCR, checks if text is readable. This catches cases where XML-based fixes aren't enough.

### Agent V: When Vision IS Needed

Agent V renders slides and asks Claude to visually analyze them:

```python
# Render slide → PNG
render_slide_to_image(pptx, slide_num=1, output="slide1.png")

# Ask Claude
response = claude.messages.create(
    messages=[{
        "content": [
            {"type": "image", "source": image_data},
            {"type": "text", "text": "Is this slide's RTL layout correct?"}
        ]
    }]
)
```

**What Vision can detect that XML cannot:**
- Gradient/image backgrounds making text invisible
- Icons that "look" wrong even if positioned correctly
- Spacing that seems awkward to a human
- Overall design quality
- Directional elements that aren't in the name pattern

**Cost:** ~$0.01-0.03 per slide (with Claude 3.5 Sonnet)

## Installation

### 1. Python Dependencies

```bash
cd /Users/djioni/KSA-AI-TRANSLATE
source .venv/bin/activate

# Core dependencies (required)
pip install python-pptx lxml

# OCR dependencies (optional, for Agent D validation)
brew install tesseract
pip install pytesseract pymupdf pillow

# Vision dependencies (optional, for Agent V)
pip install anthropic pymupdf pillow

# Rendering (required for OCR and Vision)
brew install --cask libreoffice
```

### 2. Environment Variables

```bash
# Python binary for server
export PYTHON_BIN="/Users/djioni/KSA-AI-TRANSLATE/.venv/bin/python"

# API key for Vision QA (optional)
export ANTHROPIC_API_KEY="sk-ant-your-key-here"
```

### 3. Restart Server

```bash
cd /Users/djioni/KSA-AI-TRANSLATE/server
npm run dev
```

## Usage

### Option 1: Two-Agent Pipeline (Recommended Start)

```bash
./TEST_TWO_AGENT.sh
```

Or manually:

```bash
curl -f -X POST http://localhost:3000/transform-full \
  -F 'pptx=@/Users/djioni/Downloads/Template for Translation slide 2.pptx' \
  -F 'map=@/Users/djioni/KSA-AI-TRANSLATE/slides_map_ar.json' \
  -F 'mirrorPositions=false' \
  -F 'arabicFont=Cairo' \
  -F 'brandDark=#0D2A47' \
  -F 'brandLight=#FFFFFF' \
  -F 'minContrast=4.5' \
  -F 'flipDirectionalIcons=true' \
  -F 'snapIcons=true' \
  -o /Users/djioni/Desktop/slides_AR.pptx
```

**This runs:** Agent T → Agent D (with OCR)

**Check:** Open `slides_AR.pptx` - should fix your white-on-white and left-alignment issues.

### Option 2: Three-Agent Pipeline (Full QA)

```bash
curl -f -X POST http://localhost:3000/transform-vision \
  -F 'pptx=@/Users/djioni/Downloads/Template for Translation slide 2.pptx' \
  -F 'map=@/Users/djioni/KSA-AI-TRANSLATE/slides_map_ar.json' \
  -F 'apiKey=sk-ant-your-key' \
  -F 'mirrorPositions=false' \
  -F 'arabicFont=Cairo' \
  -F 'brandDark=#0D2A47' \
  -F 'brandLight=#FFFFFF' \
  -F 'minContrast=4.5' \
  -F 'flipDirectionalIcons=true' \
  -F 'snapIcons=true' \
  -o /Users/djioni/Desktop/slides_AR_QA.pptx
```

**This runs:** Agent T → Agent D (with OCR) → Agent V (Vision QA)

**Check response headers:**
```bash
curl -i -X POST http://localhost:3000/transform-vision ... | grep X-Vision-Report
```

Decode the base64 header to see the QA report:
```bash
echo "base64string" | base64 -d | jq
```

### Option 3: Manual CLI (Full Control)

```bash
cd /Users/djioni/KSA-AI-TRANSLATE
source .venv/bin/activate

# Step 1: Agent T
python rtl_pptx_transformer.py transform \
  'input.pptx' \
  --map translations.json \
  --out /tmp/rtl.pptx \
  --no-mirror \
  --no-contrast-fix

# Step 2: Agent D with OCR
python designer_agent.py \
  --in /tmp/rtl.pptx \
  --out /tmp/design.pptx \
  --brand-dark "#0D2A47" \
  --brand-light "#FFFFFF" \
  --min-contrast 4.5 \
  --flip-directional-icons \
  --snap-icons \
  --ocr-report /tmp/ocr.json \
  --audit-out /tmp/audit.json

# Step 3: Agent V (Vision QA)
export ANTHROPIC_API_KEY="sk-ant-..."
python vision_qa_agent.py \
  --in /tmp/design.pptx \
  --report /tmp/vision.json \
  --slides all

# Check reports
cat /tmp/ocr.json | jq
cat /tmp/vision.json | jq
```

## Understanding the Reports

### OCR Report Structure

```json
{
  "ok": true,
  "all_readable": true,
  "slides": [
    {
      "slide": 1,
      "readable": true,
      "ocr_confidence": 87.5,
      "text_length": 342,
      "sample_text": "عناصر الاستراتيجية..."
    }
  ]
}
```

**`readable`:** OCR confidence > 60% AND text length > 20 characters

**If `all_readable: false`:** Agent D's color fixes weren't enough. You may have gradient backgrounds or other issues requiring manual adjustment.

### Vision QA Report Structure

```json
{
  "input_file": "slides.pptx",
  "total_slides": 1,
  "slides": [
    {
      "slide": 1,
      "text_visibility": {"score": 9, "issues": []},
      "rtl_layout": {"score": 8, "issues": ["One text box appears left-aligned"]},
      "icon_positioning": {"score": 10, "issues": []},
      "directional_elements": {"score": 9, "issues": []},
      "spacing": {"score": 7, "issues": ["Slight overlap between title and icon"]},
      "overall_score": 8,
      "summary": "Good RTL layout with minor spacing issue",
      "recommendations": [
        "Increase margin between title and icon by 0.5cm",
        "Double-check text box alignment in Paragraph settings"
      ]
    }
  ],
  "summary": {
    "all_passed": true,
    "average_score": 8.6
  }
}
```

**Scores:** 1-10 (8+ is passing, 6-7 needs review, <6 fails)

**`all_passed`:** All slides scored 8+

## Troubleshooting

### "White text still invisible after Agent D"

**Check OCR report:**
```bash
cat /tmp/ocr.json | jq '.slides[] | select(.readable == false)'
```

**If OCR confidence is low:**
1. The background might be a gradient (Agent D only reads base color from XML)
2. Try lowering `minContrast` to 3.0 (more aggressive)
3. Try different brand colors (darker/lighter)
4. Use Vision QA to see what Claude recommends

### "Text is still left-aligned"

**Agent D re-enforces RTL, but:**
- PowerPoint caches paragraph formatting
- Master slide might override
- Text box might have locked layout

**Solutions:**
1. Open PPTX in PowerPoint
2. Select text → Paragraph → Text Direction → Right-to-left
3. Check "Format" → "Align Right"
4. Save and retry transformation

Or use Vision QA - Claude will spot this and recommend fixes.

### "Vision QA is too slow/expensive"

**Vision QA takes ~10-15 seconds per slide** and costs ~$0.02 per slide.

**For production:**
- Use two-agent pipeline (`/transform-full`) for all slides
- Use three-agent pipeline (`/transform-vision`) only for spot-checking or final QA
- Analyze only first slide: `--slides 1` instead of `--slides all`

### "OCR validation fails: LibreOffice not found"

```bash
brew install --cask libreoffice
```

Then restart server.

### "Missing Tesseract"

```bash
brew install tesseract

# Download Arabic language data
wget https://github.com/tesseract-ocr/tessdata/raw/main/ara.traineddata
sudo mv ara.traineddata /opt/homebrew/share/tessdata/
```

## Cost Breakdown

| Component | Cost | Time |
|-----------|------|------|
| Agent T | Free | 1s |
| Agent D (XML only) | Free | 1s |
| Agent D (+ OCR) | Free | 5-10s |
| Agent V (Vision QA) | ~$0.02/slide | 10-15s/slide |

**Example:** 20-slide deck
- Two-agent (T+D): Free, ~30 seconds
- Three-agent (T+D+V): ~$0.40, ~5 minutes

## When to Use Each Pipeline

| Scenario | Use | Why |
|----------|-----|-----|
| First test | Two-agent | Fast, free, fixes 95% of issues |
| Production batch | Two-agent | Cost-effective for all slides |
| Final QA check | Three-agent on slide 1 | Verify quality before delivery |
| Problem slide | Three-agent on that slide | Get specific recommendations |
| Client deliverable | Three-agent on all | Full QA report + perfect output |

## Next Steps

1. **Run test:** `./TEST_TWO_AGENT.sh` to verify basic functionality
2. **Install OCR deps:** If test shows visibility issues
3. **Get API key:** From https://console.anthropic.com for Vision QA
4. **Try Vision QA:** On one slide to see what it catches

Then report back with results!
