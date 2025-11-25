# START HERE - Complete Setup & Test Guide

## Quick Start (3 Commands)

```bash
# 1. Install everything
./install_dependencies.sh

# 2. Start the orchestrator
cd server && npm run dev

# 3. Test (in another terminal)
./test_pipeline.sh
```

## What This Does

### Translation Workflow (JSON-based - Your Preferred Method)

```
1. Upload PPTX
   ↓
2. Extract text → JSON map (shape-by-shape)
   {
     "slide-1:shape-257": "Strategy components",
     "slide-1:shape-12": "Strategic Objectives"
   }
   ↓
3. You translate JSON (manually or via translation service)
   {
     "slide-1:shape-257": "عناصر الاستراتيجية",
     "slide-1:shape-12": "الأهداف الاستراتيجية"
   }
   ↓
4. Upload PPTX + translated JSON
   ↓
5. Three agents process:
   - Agent T: Apply JSON translations + set RTL
   - Agent D: Fix colors, position icons
   - Agent V: Validate with Claude Vision
   ↓
6. Download Arabic PPTX with QA reports
```

## Dependencies Summary

### Required (Always Install)

| What | Why | How |
|------|-----|-----|
| Redis | Job queue storage | `brew install redis` |
| Python 3.13 | Run transformation scripts | Already have it |
| python-pptx | Read/write PPTX files | `pip install python-pptx` |
| BullMQ | Job queue library | `npm install bullmq` |

### Optional (Better Quality)

| What | Why | How |
|------|-----|-----|
| Tesseract | OCR validation | `brew install tesseract` |
| LibreOffice | Render slides for OCR | `brew install --cask libreoffice` |
| Anthropic SDK | Claude Vision QA | `pip install anthropic` |

## Architecture

```
HTTP Request → BullMQ Queue → Immediate Response (jobId)
                    ↓
            Background Workers:

┌─────────────────────────────────────┐
│ Agent T Worker (2 concurrent)       │
│ • Reads: input.pptx + map.json      │
│ • Applies: JSON translations        │
│ • Sets: RTL paragraph properties    │
│ • Writes: rtl.pptx                  │
└──────────┬──────────────────────────┘
           │ (waits for T to finish)
           ↓
┌─────────────────────────────────────┐
│ Agent D Worker (2 concurrent)       │
│ • Reads: rtl.pptx                   │
│ • Fixes: white-on-white text        │
│ • Snaps: icons to right of text     │
│ • Validates: OCR check              │
│ • Writes: design.pptx + reports     │
└──────────┬──────────────────────────┘
           │ (waits for D to finish)
           ↓
┌─────────────────────────────────────┐
│ Agent V Worker (1 concurrent)       │
│ • Reads: design.pptx                │
│ • Renders: slides to images         │
│ • Analyzes: with Claude Vision      │
│ • Writes: vision_report.json        │
└─────────────────────────────────────┘
```

**Key Point:** Agents don't talk to each other. BullMQ ensures execution order via dependency graph.

## File Structure

```
/Users/djioni/KSA-AI-TRANSLATE/
├── .venv/                          # Python virtual environment
├── server/
│   ├── .env                        # Configuration (create this)
│   ├── src/
│   │   └── orchestrator.ts         # BullMQ orchestrator
│   └── package.json
├── jobs/                           # Job data (created automatically)
│   └── abc123xyz/                  # Each job gets a folder
│       ├── manifest.json           # Job status tracking
│       ├── input.pptx              # Original file
│       ├── map.json                # Your translations
│       ├── rtl.pptx                # After Agent T
│       ├── design.pptx             # After Agent D (final)
│       ├── audit.json              # Agent D fixes
│       ├── ocr_report.json         # OCR validation
│       └── vision_report.json      # Claude Vision QA
├── rtl_pptx_transformer.py         # Agent T
├── designer_agent.py               # Agent D
├── vision_qa_agent.py              # Agent V
├── slides_map_ar.json              # Example translations
├── install_dependencies.sh         # ← Run this first
└── test_pipeline.sh                # ← Run this to test
```

## Step-by-Step Instructions

### 1. Install Dependencies (One Time)

```bash
cd /Users/djioni/KSA-AI-TRANSLATE
./install_dependencies.sh
```

This installs:
- Redis
- Tesseract (OCR)
- LibreOffice
- Python packages
- Node packages
- Creates .env file

### 2. Configure API Key (Optional, for Vision QA)

```bash
# Edit .env
nano server/.env

# Add your key:
ANTHROPIC_API_KEY=sk-ant-your-actual-key
```

Without this, Vision QA will be skipped (OCR still works).

### 3. Start Redis (Required)

```bash
# Redis should auto-start from install script
# Verify:
redis-cli ping
# Should return: PONG

# If not running:
brew services start redis
```

### 4. Start Orchestrator

```bash
cd /Users/djioni/KSA-AI-TRANSLATE/server
npm run dev
```

You should see:
```
🚀 RTL PPTX Orchestrator running on http://localhost:3000
📊 Redis: 127.0.0.1:6379
🐍 Python: /Users/djioni/KSA-AI-TRANSLATE/.venv/bin/python
📁 Jobs: /Users/djioni/KSA-AI-TRANSLATE/jobs
```

### 5. Test the Pipeline

**Option A: Automated Test**

```bash
# In a new terminal
cd /Users/djioni/KSA-AI-TRANSLATE
./test_pipeline.sh
```

This will:
1. Submit your test file
2. Poll status every 5 seconds
3. Download result when done
4. Show QA reports

**Option B: Manual Test**

```bash
# Submit job
curl -X POST http://localhost:3000/submit \
  -F 'pptx=@/Users/djioni/Downloads/Template for Translation slide 2.pptx' \
  -F 'map=@slides_map_ar.json'

# Returns:
# {
#   "ok": true,
#   "jobId": "abc123xyz",
#   "checkStatus": "/status/abc123xyz"
# }

# Check status (repeat until "completed")
curl http://localhost:3000/status/abc123xyz | jq

# Download
curl -o slides_AR.pptx http://localhost:3000/download/abc123xyz
```

## Understanding the JSON Translation Map

### Why JSON is Better

**JSON approach (what we use):**
- ✅ Precise - Each translation targets exact shape ID
- ✅ Reviewable - You can see/edit before applying
- ✅ Traceable - Version control friendly
- ✅ Accurate - No AI hallucination

**Direct AI translation:**
- ❌ Ambiguous - AI guesses which text box is which
- ❌ Risky - Can't review before changing file
- ❌ Black box - Hard to debug issues

### How to Create Translation Map

**1. Extract text from PPTX:**

```bash
curl -X POST http://localhost:3000/dump-map \
  -F 'pptx=@input.pptx' \
  -o my_translations.json
```

**2. You get JSON with shape IDs:**

```json
{
  "slide-1:shape-257": "Strategy components",
  "slide-1:shape-12": "Strategic Objectives & KPIs",
  "slide-1:shape-13": "Strategic Pillars"
}
```

**3. Translate values (keep keys unchanged):**

```json
{
  "slide-1:shape-257": "عناصر الاستراتيجية",
  "slide-1:shape-12": "الأهداف الاستراتيجية ومؤشرات الأداء",
  "slide-1:shape-13": "الأعمدة الاستراتيجية"
}
```

**4. Use translated JSON:**

```bash
curl -X POST http://localhost:3000/submit \
  -F 'pptx=@input.pptx' \
  -F 'map=@my_translations.json'
```

**Agent T reads the JSON and replaces text in each shape by ID.**

## Monitoring & Debugging

### Check Job Status

```bash
# Get status
curl http://localhost:3000/status/abc123xyz | jq

# Possible statuses:
# - queued
# - running_agent_t
# - completed_agent_t
# - running_agent_d
# - completed_agent_d
# - running_agent_v
# - completed
# - failed_agent_t / failed_agent_d
```

### View Job Files

```bash
# Each job creates a folder
ls /Users/djioni/KSA-AI-TRANSLATE/jobs/abc123xyz/

# View manifest
cat /Users/djioni/KSA-AI-TRANSLATE/jobs/abc123xyz/manifest.json | jq
```

### Check Redis Queue

```bash
# See pending jobs
redis-cli
> KEYS bull:agent-t:*
> GET bull:agent-t:waiting
```

### Server Logs

The orchestrator prints detailed logs:
```
[Agent T] Processing job abc123xyz
[Agent T] Completed job abc123xyz
[Agent D] Processing job abc123xyz
[Agent D] Completed job abc123xyz
[Agent V] Processing job abc123xyz
[Agent V] Completed job abc123xyz
```

## Troubleshooting

### Server won't start

**Error:** `Error: connect ECONNREFUSED 127.0.0.1:6379`

**Fix:**
```bash
brew services start redis
redis-cli ping  # Should return PONG
```

### Job stuck in queue

**Check worker logs** - look for Python errors

**Common issues:**
- Python venv not activated
- Missing python-pptx
- File permissions

**Fix:**
```bash
source /Users/djioni/KSA-AI-TRANSLATE/.venv/bin/activate
pip list | grep python-pptx
```

### OCR validation failing

**Error:** `LibreOffice not found`

**Fix:**
```bash
brew install --cask libreoffice
which soffice  # Should return path
```

### Vision QA not running

**Check:** Do you have ANTHROPIC_API_KEY in .env?

**Note:** Vision QA failure is non-fatal - job still completes

## Next Steps

1. ✅ Run `./install_dependencies.sh`
2. ✅ Start server: `cd server && npm run dev`
3. ✅ Test: `./test_pipeline.sh`
4. ✅ Check output: `open /Users/djioni/Desktop/slides_AR_test.pptx`
5. 📄 Review reports: `curl http://localhost:3000/reports/jobId | jq`

## Questions?

- **How agents work:** See `ARCHITECTURE.md`
- **BullMQ setup:** See `BULLMQ_SETUP.md`
- **Full details:** See `COMPLETE_SETUP.md`
