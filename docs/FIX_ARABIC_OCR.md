# Fix: Arabic OCR Not Working

## Root Cause

Your Tesseract installation **does not have Arabic language support**.

Current languages:
```bash
$ tesseract --list-langs
eng      # English only!
osd
snum
```

When Tesseract tries to OCR Arabic text without the Arabic language pack, it treats the glyphs as English characters and produces garbage like:
```
"SIA) Cal di'geg Ana UN Cala) Aga ON) Saeed) AILo..."
```

## Solution: Install Arabic Language Pack

### Option 1: Install via Homebrew (Recommended)

```bash
# Install all Tesseract language packs
brew install tesseract-lang

# Or install just Arabic
cd /opt/homebrew/share/tessdata
curl -O https://github.com/tesseract-ocr/tessdata/raw/main/ara.traineddata
```

### Option 2: Manual Download

```bash
# Download Arabic training data
cd /opt/homebrew/share/tessdata
curl -O https://github.com/tesseract-ocr/tessdata_best/raw/main/ara.traineddata
```

### Verify Installation

```bash
tesseract --list-langs
```

Should now show:
```
List of available languages in "/opt/homebrew/share/tessdata/" (4):
ara      # ← Arabic added!
eng
osd
snum
```

## Update Designer Agent

The designer agent needs to specify the Arabic language when running Tesseract:

```python
# designer_agent.py line ~220
text = pytesseract.image_to_string(image, lang='ara')  # ← Should use 'ara'
data = pytesseract.image_to_data(image, lang='ara', output_type=pytesseract.Output.DICT)
```

Let me check if this is already implemented...
