# BullMQ Production Setup

## What Changed

**OLD (Synchronous):**
```
HTTP Request → Agent T → Agent D → Agent V → Response (blocks for minutes)
```

**NEW (BullMQ Queue):**
```
HTTP Request → Queue Job → Immediate Response with jobId
                ↓
          Background Workers:
          Agent T Worker → Agent D Worker → Agent V Worker
```

## Dependencies

### 1. Install Redis

**macOS:**
```bash
brew install redis
brew services start redis
```

**Docker:**
```bash
docker run -d -p 6379:6379 --name redis redis:7
```

**Test Redis:**
```bash
redis-cli ping
# Should return: PONG
```

### 2. Install Node Packages

Already installed:
```bash
cd /Users/djioni/KSA-AI-TRANSLATE/server
npm install
# bullmq, ioredis, nanoid already added
```

## Configuration

Create `.env` file in `/Users/djioni/KSA-AI-TRANSLATE/server/.env`:

```bash
# Redis connection
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# Python binary
PYTHON_BIN=/Users/djioni/KSA-AI-TRANSLATE/.venv/bin/python

# Jobs directory (where files are stored)
JOBS_DIR=/Users/djioni/KSA-AI-TRANSLATE/jobs

# Server port
PORT=3000

# Optional: Anthropic API key for Vision QA
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

## Start the Orchestrator

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

[Agent T] Worker started
[Agent D] Worker started
[Agent V] Worker started
```

## Usage

### 1. Submit a Job

```bash
curl -X POST http://localhost:3000/submit \
  -F 'pptx=@/Users/djioni/Downloads/Template for Translation slide 2.pptx' \
  -F 'map=@/Users/djioni/KSA-AI-TRANSLATE/slides_map_ar.json' \
  -F 'brandDark=#0D2A47' \
  -F 'brandLight=#FFFFFF' \
  -F 'minContrast=4.5' \
  -F 'flipDirectionalIcons=true' \
  -F 'snapIcons=true'
```

**Response:**
```json
{
  "ok": true,
  "jobId": "abc123xyz",
  "status": "queued",
  "checkStatus": "/status/abc123xyz",
  "download": "/download/abc123xyz"
}
```

### 2. Check Status

```bash
curl http://localhost:3000/status/abc123xyz | jq
```

**Response during processing:**
```json
{
  "ok": true,
  "jobId": "abc123xyz",
  "status": "running_agent_d",
  "createdAt": "2025-10-22T14:30:00.000Z",
  "outputs": {
    "rtl": "/path/to/rtl.pptx"
  },
  "errors": []
}
```

**Response when complete:**
```json
{
  "ok": true,
  "jobId": "abc123xyz",
  "status": "completed",
  "createdAt": "2025-10-22T14:30:00.000Z",
  "outputs": {
    "rtl": "/path/to/rtl.pptx",
    "design": "/path/to/design.pptx",
    "audit": "/path/to/audit.json",
    "ocrReport": "/path/to/ocr_report.json",
    "visionReport": "/path/to/vision_report.json"
  },
  "errors": []
}
```

### 3. Download Result

```bash
curl -o slides_AR.pptx http://localhost:3000/download/abc123xyz
```

### 4. Get QA Reports

```bash
curl http://localhost:3000/reports/abc123xyz | jq
```

**Response:**
```json
{
  "ok": true,
  "jobId": "abc123xyz",
  "reports": {
    "audit": { /* Agent D fixes */ },
    "ocr": { /* OCR validation results */ },
    "vision": { /* Claude Vision QA scores */ }
  }
}
```

## Status Flow

Jobs progress through these statuses:

```
queued
  ↓
running_agent_t
  ↓
completed_agent_t
  ↓
running_agent_d
  ↓
completed_agent_d
  ↓
running_agent_v
  ↓
completed (or completed_without_vision if Vision fails)
```

**Error states:**
- `failed_agent_t` - Translation failed
- `failed_agent_d` - Design fixes failed
- (Agent V errors are non-fatal)

## Advantages Over Old System

### ✅ Non-Blocking
**OLD:**
```bash
curl ... # Waits 5 minutes, then returns PPTX
```

**NEW:**
```bash
curl ... # Returns immediately with jobId
# Check status when ready
curl /status/jobId
# Download when complete
curl /download/jobId
```

### ✅ Automatic Retries

If Agent T fails due to temporary issue (file lock, etc.), BullMQ automatically retries:
- Attempt 1: Immediate
- Attempt 2: After 2 seconds
- Attempt 3: After 4 seconds (exponential backoff)

### ✅ Concurrent Processing

Multiple users can submit jobs simultaneously:
```bash
# User 1
curl -X POST /submit -F 'pptx=@file1.pptx' # Returns jobId: abc

# User 2 (immediately after)
curl -X POST /submit -F 'pptx=@file2.pptx' # Returns jobId: xyz

# Both process in parallel
```

Workers process jobs concurrently (configurable):
- Agent T: 2 concurrent jobs
- Agent D: 2 concurrent jobs
- Agent V: 1 concurrent job (slow, limit concurrency)

### ✅ Persistence

**OLD:** Server restart = lost job

**NEW:** Jobs stored in Redis
```bash
# Submit job
curl -X POST /submit ... # Returns jobId: abc123

# Server crashes/restarts
npm run dev

# Job resumes automatically from where it left off
curl /status/abc123 # Still processing
```

### ✅ Dependency Management

BullMQ FlowProducer ensures:
- Agent D **never starts** until Agent T completes successfully
- Agent V **never starts** until Agent D completes successfully
- If Agent T fails, Agent D is never queued
- If you want only T+D (no Vision), just don't create the V child job

## Monitoring

### Check Queue Status

```bash
# Install BullMQ CLI
npm install -g bullmq-cli

# Check queues
bullmq-cli queue list --redis redis://127.0.0.1:6379

# Check specific queue
bullmq-cli queue inspect agent-t --redis redis://127.0.0.1:6379
```

### View Jobs Directory

```bash
ls /Users/djioni/KSA-AI-TRANSLATE/jobs/
# abc123xyz/
#   ├── manifest.json
#   ├── input.pptx
#   ├── map.json
#   ├── rtl.pptx
#   ├── design.pptx
#   ├── audit.json
#   ├── ocr_report.json
#   └── vision_report.json
```

### Inspect Manifest

```bash
cat /Users/djioni/KSA-AI-TRANSLATE/jobs/abc123xyz/manifest.json | jq
```

## Troubleshooting

### Redis Connection Error

```
Error: connect ECONNREFUSED 127.0.0.1:6379
```

**Solution:**
```bash
# Check if Redis is running
redis-cli ping

# If not, start it
brew services start redis
# OR
docker start redis
```

### Python Not Found

```
Error: spawn ENOENT
```

**Solution:** Set correct Python path in `.env`:
```bash
PYTHON_BIN=/Users/djioni/KSA-AI-TRANSLATE/.venv/bin/python
```

Test:
```bash
/Users/djioni/KSA-AI-TRANSLATE/.venv/bin/python --version
```

### Job Stuck in Queue

Check worker logs:
```bash
npm run dev
# Look for errors in [Agent T/D/V] logs
```

Check Redis:
```bash
redis-cli
> KEYS *
> GET bull:agent-t:*
```

### Clean Up Failed Jobs

```bash
# Remove old job files
rm -rf /Users/djioni/KSA-AI-TRANSLATE/jobs/old_job_id

# Clear Redis queue (CAREFUL - removes all jobs)
redis-cli
> FLUSHDB
```

## Production Deployment

### Environment Variables

```bash
# Production .env
REDIS_HOST=your-redis-host.com
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
PYTHON_BIN=/path/to/production/venv/bin/python
JOBS_DIR=/var/lib/rtl-pptx/jobs
PORT=3000
ANTHROPIC_API_KEY=sk-ant-prod-key
```

### Update Connection

```typescript
// server/src/orchestrator.ts
const connection = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: process.env.REDIS_PASSWORD, // Add this
  tls: process.env.REDIS_TLS === 'true' ? {} : undefined, // For Redis Cloud
};
```

### Scale Workers

Run multiple worker processes:

```bash
# Server 1: API only (no workers)
NODE_ENV=production ENABLE_WORKERS=false npm start

# Server 2: Workers only
NODE_ENV=production ENABLE_API=false npm start

# Server 3: More workers
NODE_ENV=production ENABLE_API=false npm start
```

Update orchestrator.ts to conditionally start API/workers based on env vars.

## Comparison: Old vs New

| Feature | Old (Sync) | New (BullMQ) |
|---------|------------|--------------|
| Request blocks | ✅ Yes (minutes) | ❌ No (instant response) |
| Concurrent jobs | ❌ No | ✅ Yes |
| Auto retry | ❌ No | ✅ Yes (3x with backoff) |
| Survives restart | ❌ No | ✅ Yes (Redis persistence) |
| Progress tracking | ❌ No | ✅ Yes (/status endpoint) |
| Dependencies | None | Redis |
| Complexity | Low | Medium |
| Setup time | 0 min | 5 min |
| Best for | Dev/testing | Production |

## Next Steps

1. **Start Redis:** `brew services start redis`
2. **Create .env:** Copy template above
3. **Start orchestrator:** `npm run dev`
4. **Submit test job:** Use curl example
5. **Check status:** `curl /status/jobId`
6. **Download result:** `curl /download/jobId`

Report any issues!
