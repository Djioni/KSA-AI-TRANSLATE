# TEXT-ONLY RTL MODE (Recommended for Most Slides)

## The Problem with Full Mirroring

Your slides have **carefully designed layouts** with:
- Background shapes and decorative elements
- Precisely positioned icons and graphics
- Color-coded sections

When we mirror ALL shapes, it breaks this design completely.

## The Solution: Text-Only RTL Mode

I've added a new `--no-mirror` flag that:
- ✅ Translates text to Arabic
- ✅ Sets RTL paragraph direction (proper bidirectional text)
- ✅ Right-aligns all text
- ✅ Applies Arabic font
- ❌ Does NOT move shapes around
- ❌ Does NOT flip icons
- ❌ Does NOT change colors

This gives you **Arabic text with proper RTL behavior** while **preserving your layout**.

## How to Use (Restart Server First)

**1. Stop your current server (Ctrl+C) and restart:**

```bash
cd /Users/djioni/KSA-AI-TRANSLATE/server
export PYTHON_BIN="/Users/djioni/KSA-AI-TRANSLATE/.venv/bin/python"
npm run dev
```

**2. Run TEXT-ONLY transformation:**

```bash
curl -f -X POST http://localhost:3000/transform \
  -F 'pptx=@/Users/djioni/Downloads/Template for Translation slide 2.pptx' \
  -F 'map=@/Users/djioni/KSA-AI-TRANSLATE/slides_map_ar.json' \
  -F 'mirrorPositions=false' \
  -F 'flipIcons=false' \
  -F 'arabicDigits=false' \
  -F 'contrastFix=false' \
  -F 'arabicFont=Cairo' \
  -o /Users/djioni/Desktop/slides_AR_text_only.pptx
```

**What this does:**
- Replaces English text with Arabic from the map
- Makes text flow right-to-left with proper RTL paragraph properties
- Right-aligns all text
- Applies Cairo font
- **Leaves everything else untouched** (positions, colors, icons)

## Visual Comparison

### Before (English LTR):
```
[Icon]  Title text               [Background bar]
        Body text left-aligned
```

### After Full Mirror (BROKEN):
```
[raBdnuorgkcaB]  txet eltiT  [nocI]  ← Everything flipped, layout destroyed
                 dengila-thgir txet ydoB
```

### After Text-Only (CORRECT):
```
[Icon]  نص العنوان               [Background bar]  ← Layout preserved
        نص المحتوى محاذى لليمين
```

## When to Use Full Mirroring

Only use full mirroring (`mirrorPositions=true`) if:
- Your slide is **symmetrical** (same on left and right)
- You have **directional flow charts** that need physical reversal
- You're okay manually fixing overlaps afterward

For most professional slide decks with designed layouts: **USE TEXT-ONLY MODE**.

## CLI Equivalent

```bash
python rtl_pptx_transformer.py transform \
  '/Users/djioni/Downloads/Template for Translation slide 2.pptx' \
  --map slides_map_ar.json \
  --out /Users/djioni/Desktop/slides_AR_text_only.pptx \
  --arabic-font "Cairo" \
  --no-mirror \
  --no-contrast-fix
```

## API Parameter Reference

| Parameter | Set to | Effect |
|-----------|--------|--------|
| `mirrorPositions` | `false` | **TEXT-ONLY MODE** - Preserves layout |
| `mirrorPositions` | `true` | Full mirror - moves all shapes |
| `flipIcons` | `false` | Don't flip images (recommended for logos) |
| `arabicDigits` | `false` | Keep western digits 0-9 |
| `arabicDigits` | `true` | Convert to Arabic-Indic ٠-٩ |
| `contrastFix` | `false` | Don't change colors (recommended) |
| `arabicFont` | `"Cairo"` | Modern, clean Arabic font |
| `arabicFont` | `"Noto Naskh Arabic"` | Traditional serif Arabic |

## Troubleshooting

### "Text isn't flowing right-to-left properly"
Even in text-only mode, we set the `a:pPr @rtl="1"` attribute at the XML level, which forces true bidirectional behavior. If you see issues:
- Check that you're opening in PowerPoint (not Preview/Quick Look)
- Try selecting the text and verify it shows "Right-to-Left" in paragraph settings

### "Some text still looks left-aligned"
Certain PowerPoint text boxes have forced alignment. The transformer:
1. Sets paragraph-level RTL (`a:pPr @rtl="1"`)
2. Sets alignment to right (`algn="r"`)
3. Sets PowerPoint enum `PP_ALIGN.RIGHT`

If it still shows LTR, the text box may have a locked layout property in the master slide.

### "I need SOME shapes mirrored but not all"
Currently it's all-or-nothing. For selective mirroring:
1. Use text-only mode
2. Manually select and flip specific shapes in PowerPoint afterward
3. Or modify the Python script to add shape name filters

## Complete Example Workflow

```bash
# 1. Generate fresh map from your file
curl -f -X POST http://localhost:3000/dump-map \
  -F 'pptx=@/Users/djioni/Downloads/Template for Translation slide 2.pptx' \
  -o /Users/djioni/fresh_map.json

# 2. Edit fresh_map.json - add Arabic translations, remove empty values

# 3. Transform with text-only mode
curl -f -X POST http://localhost:3000/transform \
  -F 'pptx=@/Users/djioni/Downloads/Template for Translation slide 2.pptx' \
  -F 'map=@/Users/djioni/fresh_map.json' \
  -F 'mirrorPositions=false' \
  -F 'flipIcons=false' \
  -F 'arabicDigits=false' \
  -F 'contrastFix=false' \
  -F 'arabicFont=Cairo' \
  -o /Users/djioni/Desktop/final_AR.pptx

# 4. Open final_AR.pptx and verify:
#    - Text is in Arabic
#    - Text flows right-to-left
#    - Layout matches original
#    - Colors unchanged
```

## Next Steps

1. **Try the text-only command above** with your actual file
2. **Open the result** and verify the layout is preserved
3. **If you need table column reversal**, you can enable `mirrorPositions=true` just for slides with tables, and `false` for designed slides
4. **Report back** what you see - we can fine-tune from there
