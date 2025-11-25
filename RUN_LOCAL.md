# Running the RTL PPTX Transformer Locally

## The Problem You Encountered

Your original run had two issues:
1. **Empty values in the translation map** → Those shapes got cleared, making content "disappear"
2. **Contrast fix changed colors** → Made some text invisible (white-on-white)

## Complete Setup (One-Time)

### 1. Install Python Dependencies

```bash
cd /Users/djioni/KSA-AI-TRANSLATE

# Activate the virtual environment
source .venv/bin/activate

# Install python-pptx if not already installed
pip install python-pptx
```

### 2. Install Node.js Dependencies

```bash
cd server
npm install
```

## Running the Server

**Always run from the `server/` directory:**

```bash
cd /Users/djioni/KSA-AI-TRANSLATE/server

# Set Python binary path (points to parent venv)
export PYTHON_BIN="/Users/djioni/KSA-AI-TRANSLATE/.venv/bin/python"

# Start development server
npm run dev
```

You should see:
```
Using Python: /Users/djioni/KSA-AI-TRANSLATE/.venv/bin/python
RTL PPTX API listening on http://localhost:3000
```

**Test the server is running:**
```bash
curl http://localhost:3000/health
# Should return: {"ok":true}
```

## Step-by-Step Transformation

### Step 1: Generate Translation Map (Already Done)

This extracts all text from your PPTX:

```bash
curl -f -X POST http://localhost:3000/dump-map \
  -F 'pptx=@/Users/djioni/Downloads/Template_Translation_slide_2_copie.pptx' \
  -o dump_map.json
```

**Important:** I've already created a cleaned Arabic map at `slides_map_ar.json` that:
- Removes all empty values (prevents disappearing content)
- Contains proper Arabic translations
- Preserves line breaks with `\n`

### Step 2: Transform with SAFE Settings (Recommended First Run)

This isolates translation + mirroring without risky features:

```bash
curl -f -X POST http://localhost:3000/transform \
  -F 'pptx=@/Users/djioni/Downloads/Template_Translation_slide_2_copie.pptx' \
  -F 'map=@/Users/djioni/KSA-AI-TRANSLATE/slides_map_ar.json' \
  -F 'flipIcons=false' \
  -F 'arabicDigits=false' \
  -F 'contrastFix=false' \
  -F 'arabicFont=Cairo' \
  -o /Users/djioni/Desktop/slides_AR_safe.pptx
```

**What this does:**
- ✅ Applies Arabic translations
- ✅ Mirrors all shapes left ↔ right
- ✅ Sets RTL paragraph direction
- ✅ Right-aligns text
- ✅ Applies Cairo font
- ❌ Does NOT flip icons (prevents breaking logos)
- ❌ Does NOT convert digits to Arabic-Indic
- ❌ Does NOT auto-fix contrast (prevents white-on-white)

**Open `slides_AR_safe.pptx` and verify:**
- Text is in Arabic (عناصر الاستراتيجية, etc.)
- Text is right-aligned
- Shapes are mirrored
- Nothing disappeared

### Step 3: Add Icon Flipping (Optional)

If your slides have directional arrows/icons:

```bash
curl -f -X POST http://localhost:3000/transform \
  -F 'pptx=@/Users/djioni/Downloads/Template_Translation_slide_2_copie.pptx' \
  -F 'map=@/Users/djioni/KSA-AI-TRANSLATE/slides_map_ar.json' \
  -F 'flipIcons=true' \
  -F 'arabicDigits=false' \
  -F 'contrastFix=false' \
  -F 'arabicFont=Cairo' \
  -o /Users/djioni/Desktop/slides_AR_flipped.pptx
```

**What changes:**
- ✅ Horizontally flips arrows, chevrons, carets, and pictures
- ✅ Skips shapes with "logo", "brand", or "qrcode" in name

### Step 4: Add Arabic-Indic Digits (Optional)

To convert 0-9 → ٠-٩:

```bash
curl -f -X POST http://localhost:3000/transform \
  -F 'pptx=@/Users/djioni/Downloads/Template_Translation_slide_2_copie.pptx' \
  -F 'map=@/Users/djioni/KSA-AI-TRANSLATE/slides_map_ar.json' \
  -F 'flipIcons=true' \
  -F 'arabicDigits=true' \
  -F 'contrastFix=false' \
  -F 'arabicFont=Cairo' \
  -o /Users/djioni/Desktop/slides_AR_full.pptx
```

### Step 5: Enable Contrast Fix (USE WITH CAUTION)

Only enable if you have text visibility issues:

```bash
curl -f -X POST http://localhost:3000/transform \
  -F 'pptx=@/Users/djioni/Downloads/Template_Translation_slide_2_copie.pptx' \
  -F 'map=@/Users/djioni/KSA-AI-TRANSLATE/slides_map_ar.json' \
  -F 'flipIcons=true' \
  -F 'arabicDigits=true' \
  -F 'contrastFix=true' \
  -F 'arabicFont=Cairo' \
  -o /Users/djioni/Desktop/slides_AR_contrast.pptx
```

**Warning:** This calculates luminance and forces text to black or white. Can make some text invisible if background detection fails.

## Troubleshooting

### "Content disappeared"
- **Cause:** Empty strings in translation map
- **Solution:** Use the provided `slides_map_ar.json` which has no empty values

### "Text is invisible/white-on-white"
- **Cause:** `contrastFix=true` picked wrong color
- **Solution:** Set `contrastFix=false`

### "Translation didn't apply"
- **Cause:** Shape IDs in map don't match PPTX
- **Solution:** Regenerate map from the exact PPTX you're transforming:
  ```bash
  curl -f -X POST http://localhost:3000/dump-map \
    -F 'pptx=@/path/to/your.pptx' \
    -o fresh_map.json
  ```

### "Server says Python not found"
- **Cause:** `PYTHON_BIN` not set or wrong path
- **Solution:** Check the path exists:
  ```bash
  ls -la /Users/djioni/KSA-AI-TRANSLATE/.venv/bin/python
  export PYTHON_BIN="/Users/djioni/KSA-AI-TRANSLATE/.venv/bin/python"
  ```

### "npm run dev fails with ENOENT"
- **Cause:** Running from wrong directory
- **Solution:** Always `cd server` before `npm run dev`

## Alternative: Use Python CLI Directly

You can bypass the API entirely:

```bash
cd /Users/djioni/KSA-AI-TRANSLATE
source .venv/bin/activate

# Dump map
python rtl_pptx_transformer.py dump-map \
  /Users/djioni/Downloads/Template_Translation_slide_2_copie.pptx \
  --out dump_map.json

# Transform
python rtl_pptx_transformer.py transform \
  /Users/djioni/Downloads/Template_Translation_slide_2_copie.pptx \
  --map slides_map_ar.json \
  --out /Users/djioni/Desktop/slides_AR.pptx \
  --arabic-font "Cairo" \
  --no-contrast-fix
```

Add `--flip-icons` or `--arabic-digits` as needed.

## Quick Reference: API Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `pptx` | file | required | Input PPTX file |
| `map` | file | optional | Translation JSON |
| `flipIcons` | boolean | `"true"` | Flip arrows/pictures horizontally |
| `arabicDigits` | boolean | `"true"` | Convert 0-9 → ٠-٩ |
| `contrastFix` | boolean | `"true"` | Auto-adjust text color for contrast |
| `arabicFont` | string | `"Noto Naskh Arabic"` | Font family name |

**To disable a boolean flag:** `-F 'flagName=false'`
