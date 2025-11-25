# Two-Agent Pipeline for RTL Arabic Slides

## The Problem

Your screenshot shows TWO distinct issues:
1. **White text on white background** (invisible text in red square)
2. **Text still left-aligned** (RTL not properly enforced)

A single transformer can't handle both translation AND visual design fixes well. Solution: **Two specialized agents**.

## The Solution: Agent T + Agent D

### Agent T (Translation + RTL)
**What it does:**
- Translates English → Arabic
- Sets RTL paragraph direction (`a:pPr @rtl="1"`)
- Right-aligns text
- Applies Arabic font
- **Does NOT touch colors** (leaves that to Agent D)
- **Does NOT mirror positions** (preserves your layout)

### Agent D (Designer/QA)
**What it does:**
- **Fixes contrast issues** (detects white-on-white, forces readable colors)
- **Re-enforces RTL** (idempotent, fixes any missed cases)
- **Snaps icons** to the RIGHT of nearest text (RTL convention)
- **Flips directional icons** (arrows, chevrons) but not logos
- **Reduces overlaps** with gentle nudging

## Quick Start

### 1. Restart Server (Required)

```bash
cd /Users/djioni/KSA-AI-TRANSLATE/server
export PYTHON_BIN="/Users/djioni/KSA-AI-TRANSLATE/.venv/bin/python"
npm run dev
```

### 2. Use the Two-Agent Endpoint

```bash
curl -f -X POST http://localhost:3000/transform-full \
  -F 'pptx=@/Users/djioni/Downloads/Template for Translation slide 2.pptx' \
  -F 'map=@/Users/djioni/KSA-AI-TRANSLATE/slides_map_ar.json' \
  -F 'mirrorPositions=false' \
  -F 'flipIcons=false' \
  -F 'arabicDigits=false' \
  -F 'arabicFont=Cairo' \
  -F 'brandDark=#0D2A47' \
  -F 'brandLight=#FFFFFF' \
  -F 'minContrast=4.5' \
  -F 'flipDirectionalIcons=true' \
  -F 'snapIcons=true' \
  -o /Users/djioni/Desktop/slides_AR_FIXED.pptx
```

This runs BOTH agents sequentially and should fix:
- ✅ White-on-white text → Proper contrast
- ✅ Left-aligned text → Right-aligned RTL
- ✅ Icons in wrong positions → Snapped to text
- ✅ Directional icons facing wrong way → Flipped

## Manual Two-Step Process (CLI)

If you want more control, run each agent separately:

### Step 1: Agent T (Translation + RTL)

```bash
cd /Users/djioni/KSA-AI-TRANSLATE
source .venv/bin/activate

python rtl_pptx_transformer.py transform \
  '/Users/djioni/Downloads/Template for Translation slide 2.pptx' \
  --map slides_map_ar.json \
  --out /tmp/step1_rtl.pptx \
  --arabic-font "Cairo" \
  --no-mirror \
  --no-contrast-fix
```

### Step 2: Agent D (Design Fix)

```bash
python designer_agent.py \
  --in /tmp/step1_rtl.pptx \
  --out /Users/djioni/Desktop/slides_AR_FINAL.pptx \
  --brand-dark "#0D2A47" \
  --brand-light "#FFFFFF" \
  --min-contrast 4.5 \
  --flip-directional-icons \
  --snap-icons \
  --audit-out /tmp/audit.json
```

Check `/tmp/audit.json` to see exactly what Agent D fixed.

## API Parameters Explained

### Agent T Parameters (Translation)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `pptx` | required | Input PowerPoint file |
| `map` | optional | Arabic translation JSON |
| `mirrorPositions` | `false` | Mirror all shapes L↔R (usually false) |
| `flipIcons` | `false` | Flip ALL icons (use Agent D's flipDirectionalIcons instead) |
| `arabicDigits` | `false` | Convert 0-9 → ٠-٩ |
| `arabicFont` | `"Cairo"` | Font family for Arabic text |

### Agent D Parameters (Design)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `brandDark` | `"#0D2A47"` | Dark color for text (on light backgrounds) |
| `brandLight` | `"#FFFFFF"` | Light color for text (on dark backgrounds) |
| `minContrast` | `4.5` | Minimum WCAG contrast ratio (4.5 = AA) |
| `flipDirectionalIcons` | `true` | Flip arrows/chevrons (but not logos) |
| `snapIcons` | `true` | Move icons to RIGHT of nearest text |
| `iconMarginEmu` | `80000` | Gap between text and icon (~7pt) |

## Understanding the Contrast Fix

Agent D checks EVERY text run:
1. Gets the shape background color
2. Calculates contrast ratio between text and background
3. **Only if ALL runs are below `minContrast`**, it replaces text color with:
   - `brandDark` if background is light
   - `brandLight` if background is dark

This is **conservative** - it won't change your brand colors unless absolutely necessary for readability.

## Common Scenarios

### Scenario 1: "Text disappeared" (White-on-White)
**Cause:** Original had white text on light gray background (low contrast, but visible). After translation, Agent T kept white text but Agent D detected it's below threshold.

**Fix:** Agent D forces `brandDark` (#0D2A47) for readability.

**To preserve original colors:** Increase `minContrast` to 7.0 or higher (Agent D will be less aggressive).

### Scenario 2: "Text still left-aligned"
**Cause:** Agent T might have missed some paragraphs, or PowerPoint is caching alignment.

**Fix:** Agent D re-runs `ensure_textframe_rtl()` on every text shape (idempotent, safe to run twice).

**To verify:** Open the output in PowerPoint, select text, check Paragraph settings → "Text direction: Right-to-left".

### Scenario 3: "Icons are in wrong places"
**Cause:** Your English slide had icons on the LEFT of text. For Arabic RTL, they should be on the RIGHT.

**Fix:** Agent D with `snapIcons=true` finds each icon, calculates vertical overlap with text shapes, and moves icon to the right edge of the nearest text + margin.

**To disable:** Set `snapIcons=false` if you want to position icons manually.

## Checking What Agent D Fixed

Agent D writes an audit log showing exactly what it changed:

```bash
curl -X POST http://localhost:3000/transform-full \
  ... (same as above) \
  -o slides_AR.pptx

# The audit is saved in a temp directory, but you can run CLI to get it:
python designer_agent.py \
  --in /path/to/rtl.pptx \
  --out /path/to/final.pptx \
  --audit-out audit.json \
  ...

cat audit.json
```

Example audit output:
```json
[
  {
    "slide": 1,
    "shape_id": 257,
    "name": "TextBox 1",
    "fixed_contrast": true,
    "snapped_icon": false,
    "flipped_icon": false,
    "rtl_enforced": true,
    "notes": ""
  },
  {
    "slide": 1,
    "shape_id": 30,
    "name": "Arrow 1",
    "fixed_contrast": false,
    "snapped_icon": true,
    "flipped_icon": true,
    "rtl_enforced": false,
    "notes": ""
  }
]
```

## When to Use Each Approach

### Use `/transform-full` (Two-Agent API) when:
- ✅ You have designed slides with colors/icons
- ✅ You want automatic contrast correction
- ✅ You want icons repositioned for RTL
- ✅ You want a single API call

### Use `/transform` (Agent T only) when:
- You have simple text-only slides
- You want to manually fix colors/positions
- You're doing incremental testing

### Use CLI (Manual two-step) when:
- You want to inspect intermediate output
- You need to debug which agent caused an issue
- You want the audit log

## Troubleshooting

### "Colors look wrong"
Check your `brandDark` and `brandLight` hex codes. Common values:
- **Dark blue:** `#0D2A47` (good for light backgrounds)
- **Pure white:** `#FFFFFF` (good for dark backgrounds)
- **Pure black:** `#000000` (highest contrast on white)

### "Icons still on the left"
Make sure `snapIcons=true` in the API call. Also check that icons have directional keywords in their names (arrow, chevron, etc.) - Agent D only snaps non-logo shapes.

### "RTL still not working"
1. Open the PPTX in PowerPoint (not Preview/Quick Look)
2. Select the Arabic text
3. Go to Paragraph settings
4. Check "Text direction" - should be "Right-to-left"
5. If not, the shape might have a locked layout from the master slide

### "Agent D didn't flip my arrow"
Agent D only flips shapes whose **name** contains: arrow, chevron, caret, triangle-right, triangle-left, play, next, prev, bullet.

To check shape names: Open PPTX, click shape, look at "Selection Pane" in PowerPoint.

## Next Steps

1. **Test the two-agent pipeline** with your actual file
2. **Check the output** - should fix both white-on-white AND left-alignment
3. **Adjust parameters** if needed:
   - Lower `minContrast` to 3.0 if colors are too aggressive
   - Disable `snapIcons` if you want manual icon placement
4. **Report back** with results - we can fine-tune further!

## Comparison Table

| Issue | Agent T Only | Agent T + D |
|-------|-------------|-------------|
| White-on-white text | ❌ Not fixed | ✅ Fixed by D |
| Left-aligned text | ⚠️ Should fix | ✅ Re-enforced by D |
| Icons on wrong side | ❌ Not moved | ✅ Snapped by D |
| Directional icons | ⚠️ Can flip all | ✅ D flips only directional |
| Layout preserved | ✅ Yes (with `--no-mirror`) | ✅ Yes |
| Colors preserved | ✅ Unchanged | ⚠️ Fixed if low contrast |

**Recommendation:** Always use the two-agent pipeline for production slides.
