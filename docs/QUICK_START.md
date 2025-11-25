# Quick Start Guide

## 🚀 Restart Server (REQUIRED)

```bash
cd /Users/djioni/KSA-AI-TRANSLATE/server
export PYTHON_BIN="/Users/djioni/KSA-AI-TRANSLATE/.venv/bin/python"
npm run dev
```

## 🧪 Test Two-Agent Pipeline

```bash
cd /Users/djioni/KSA-AI-TRANSLATE
./TEST_TWO_AGENT.sh
```

This will:
1. Check server is running
2. Upload your PPTX
3. Run Agent T (Translation) + Agent D (Design fixes)
4. Save output to Desktop

**Expected result:** `slides_AR_TWO_AGENT.pptx` with:
- ✅ Arabic text
- ✅ Proper RTL direction
- ✅ Fixed white-on-white text
- ✅ Right-aligned paragraphs

## 🔍 If Issues Remain: Install OCR

```bash
brew install tesseract
brew install --cask libreoffice
pip install pytesseract pymupdf pillow
```

Then re-run test.

## 👁️ For Full QA: Add Vision Agent

```bash
# Get API key from https://console.anthropic.com
export ANTHROPIC_API_KEY="sk-ant-your-key"

curl -f -X POST http://localhost:3000/transform-vision \
  -F 'pptx=@/Users/djioni/Downloads/Template for Translation slide 2.pptx' \
  -F 'map=@/Users/djioni/KSA-AI-TRANSLATE/slides_map_ar.json' \
  -F 'apiKey=sk-ant-your-key' \
  -F 'mirrorPositions=false' \
  -F 'arabicFont=Cairo' \
  -F 'brandDark=#0D2A47' \
  -F 'brandLight=#FFFFFF' \
  -o /Users/djioni/Desktop/slides_AR_QA.pptx
```

## 📊 Agent Comparison

| Pipeline | Agents | Time | Cost | When to Use |
|----------|--------|------|------|-------------|
| `/transform` | T only | 1s | Free | Testing translation |
| `/transform-full` | T + D | 10s | Free | ✅ **Recommended** |
| `/transform-vision` | T + D + V | 5min | $0.40 | Final QA report |

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| Server 404 | Restart server (see top of this file) |
| White-on-white text | Install OCR dependencies |
| Left-aligned text | Check Vision QA report for specific issues |
| Slow processing | Use 2-agent, not 3-agent |

## 📖 Full Documentation

- `COMPLETE_SETUP.md` - Complete architecture explanation
- `TWO_AGENT_PIPELINE.md` - Two-agent usage guide
- `TEXT_ONLY_MODE.md` - Why `mirrorPositions=false`

## ✅ Success Checklist

- [ ] Server restarted with new build
- [ ] Two-agent test runs without errors
- [ ] Output PPTX has Arabic text
- [ ] Text is right-aligned and visible
- [ ] (Optional) OCR validation passes
- [ ] (Optional) Vision QA report looks good
