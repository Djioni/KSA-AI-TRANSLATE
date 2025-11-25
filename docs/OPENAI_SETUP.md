# OpenAI GPT-4 Vision Setup Complete

## Changes Made

### 1. Updated Vision QA Agent (`vision_qa_agent.py`)

**Old:** Used Anthropic Claude Vision API
**New:** Uses OpenAI GPT-4 Vision API

**Model:** `gpt-4o-mini-2024-07-18` (configurable via `--model` flag)

**Key Changes:**
```python
# OLD (Anthropic):
from anthropic import Anthropic
client = Anthropic(api_key=api_key)
response = client.messages.create(model="claude-3-5-sonnet-20241022", ...)

# NEW (OpenAI):
from openai import OpenAI
client = OpenAI(api_key=api_key)
response = client.chat.completions.create(model="gpt-4o-mini-2024-07-18", ...)
```

### 2. Updated Orchestrator (`server/src/orchestrator.ts`)

**Changed environment variable:**
```typescript
// OLD:
const apiKey = process.env.ANTHROPIC_API_KEY;

// NEW:
const apiKey = process.env.OPENAI_API_KEY;
```

### 3. Environment Configuration (`server/.env`)

Your `.env` file already has:
```bash
OPENAI_API_KEY=sk-proj-JJEKiwMV1PWnoUS...
```

### 4. Installed Dependencies

```bash
pip install openai  # ✅ Installed
```

## How It Works

### Agent V (Vision QA) Flow:

1. **Render slide to PNG** (using LibreOffice + PyMuPDF)
2. **Encode image to base64**
3. **Send to OpenAI GPT-4 Vision:**
   ```python
   response = client.chat.completions.create(
       model="gpt-4o-mini-2024-07-18",
       messages=[{
           "role": "user",
           "content": [
               {"type": "text", "text": "Analyze this Arabic RTL slide..."},
               {"type": "image_url", "image_url": {"url": "data:image/png;base64,..."}}
           ]
       }],
       response_format={"type": "json_object"}
   )
   ```
4. **Parse JSON response** with scores and recommendations
5. **Save to `vision_report.json`**

### Analysis Criteria:

OpenAI GPT-4 Vision will analyze:
- ✅ Text Visibility (contrast, readability)
- ✅ RTL Layout (right-alignment, Arabic conventions)
- ✅ Icon Positioning (icons on right of text for RTL)
- ✅ Directional Elements (arrows pointing correct direction)
- ✅ Spacing (overlaps, gaps)
- ✅ Overall Design Quality

Each category gets a score 1-10 with specific issues and recommendations.

## Testing

### Option 1: Restart Server and Retest

```bash
# Terminal 1: Restart server
cd /Users/djioni/KSA-AI-TRANSLATE/server
npm run dev

# Terminal 2: Run test pipeline
cd /Users/djioni/KSA-AI-TRANSLATE
./test_pipeline.sh
```

**Expected output:**
```
[Agent V] Processing job abc123xyz
🔍 Analyzing 1 slide(s) with OpenAI GPT-4 Vision (gpt-4o-mini-2024-07-18)...
  Slide 1/1...
✅ Vision QA report: /Users/djioni/.../vision_report.json
```

### Option 2: Test Vision Agent Directly

```bash
source /Users/djioni/KSA-AI-TRANSLATE/.venv/bin/activate

python vision_qa_agent.py \
  --in /Users/djioni/Desktop/slides_AR_test.pptx \
  --report vision_test_report.json \
  --slides all
```

## Model Options

You can use different OpenAI models:

### GPT-4o-mini (Default - Fast & Cheap)
```bash
--model gpt-4o-mini-2024-07-18
```
- **Cost:** ~$0.00015 per image
- **Speed:** Fast
- **Quality:** Good for most cases

### GPT-4o (Higher Quality)
```bash
--model gpt-4o-2024-08-06
```
- **Cost:** ~$0.0025 per image (16x more expensive)
- **Speed:** Slower
- **Quality:** Best vision understanding

### GPT-4-turbo (Legacy)
```bash
--model gpt-4-turbo-2024-04-09
```
- **Cost:** ~$0.01 per image
- **Speed:** Slowest
- **Quality:** Older model, not recommended

## Comparison: OpenAI vs Anthropic

| Feature | OpenAI GPT-4o-mini | Anthropic Claude 3.5 Sonnet |
|---------|-------------------|---------------------------|
| **Cost** | $0.00015/image | $0.00125/image (8x more) |
| **Speed** | Very Fast | Fast |
| **Vision Quality** | Good | Excellent |
| **JSON Mode** | Native support | Manual parsing |
| **Max Image Size** | 20MB | 5MB |
| **RTL Understanding** | Good | Excellent |

**Recommendation:** Start with `gpt-4o-mini` for testing. If quality isn't good enough, upgrade to `gpt-4o`.

## Next Steps

1. ✅ **Install Arabic language pack for Tesseract** (still needed for OCR validation):
   ```bash
   brew install tesseract-lang
   # OR
   cd /opt/homebrew/share/tessdata
   curl -O https://github.com/tesseract-ocr/tessdata/raw/main/ara.traineddata
   ```

2. ✅ **Restart server** to pick up `OPENAI_API_KEY`:
   ```bash
   cd server && npm run dev
   ```

3. ✅ **Rerun test pipeline**:
   ```bash
   ./test_pipeline.sh
   ```

4. ✅ **Check Vision QA report**:
   ```bash
   cat jobs/{jobId}/vision_report.json | jq
   ```

## Troubleshooting

### Error: "No API key provided"

Make sure `OPENAI_API_KEY` is set in `/Users/djioni/KSA-AI-TRANSLATE/server/.env`:
```bash
cat server/.env | grep OPENAI_API_KEY
```

### Error: "OpenAI package not installed"

```bash
source .venv/bin/activate
pip install openai
```

### Error: "Invalid API key"

Check your OpenAI API key at https://platform.openai.com/api-keys

### Low Vision QA Scores

If OpenAI reports low scores:
1. Check the actual slide output (open in PowerPoint)
2. Review the specific issues in `vision_report.json`
3. Consider using `gpt-4o` instead of `gpt-4o-mini` for better analysis

## Summary

✅ Vision agent now uses **OpenAI GPT-4o-mini** instead of Anthropic Claude
✅ Environment variable changed from `ANTHROPIC_API_KEY` to `OPENAI_API_KEY`
✅ Python package `openai` installed
✅ Orchestrator rebuilt with changes
✅ Ready to test!

**Next:** Install Tesseract Arabic language pack and rerun the test pipeline.
