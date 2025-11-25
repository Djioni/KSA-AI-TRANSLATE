#!/bin/bash
# Test the complete three-agent pipeline

set -e

echo "🧪 Testing RTL PPTX Orchestrator"
echo ""

# Check if server is running
if ! curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo "❌ Server not running!"
    echo ""
    echo "Start the server first:"
    echo "  cd /Users/djioni/KSA-AI-TRANSLATE/server"
    echo "  npm run dev"
    exit 1
fi

echo "✅ Server is running"
echo ""

# Submit job
echo "📤 Submitting job..."
RESPONSE=$(curl -s -X POST http://localhost:3000/submit \
  -F 'pptx=@/Users/djioni/Downloads/Template for Translation slide 2.pptx' \
  -F 'map=@/Users/djioni/KSA-AI-TRANSLATE/slides_map_ar.json' \
  -F 'brandDark=#0D2A47' \
  -F 'brandLight=#FFFFFF')

echo "$RESPONSE" | jq
echo ""

# Extract jobId
JOB_ID=$(echo "$RESPONSE" | jq -r '.jobId')

if [ "$JOB_ID" = "null" ] || [ -z "$JOB_ID" ]; then
    echo "❌ Failed to submit job"
    exit 1
fi

echo "📋 Job ID: $JOB_ID"
echo ""

# Poll status
echo "⏳ Waiting for job to complete..."
MAX_WAIT=300  # 5 minutes
ELAPSED=0

while [ $ELAPSED -lt $MAX_WAIT ]; do
    STATUS_RESPONSE=$(curl -s http://localhost:3000/status/$JOB_ID)
    STATUS=$(echo "$STATUS_RESPONSE" | jq -r '.status')

    echo "  Status: $STATUS"

    if [ "$STATUS" = "completed" ] || [ "$STATUS" = "completed_without_vision" ]; then
        echo ""
        echo "✅ Job completed!"
        echo ""
        echo "📊 Final status:"
        echo "$STATUS_RESPONSE" | jq
        echo ""

        # Download result
        echo "📥 Downloading result..."
        curl -s -o /Users/djioni/Desktop/slides_AR_test.pptx http://localhost:3000/download/$JOB_ID
        echo "✅ Downloaded to: /Users/djioni/Desktop/slides_AR_test.pptx"
        echo ""

        # Get reports
        echo "📄 QA Reports:"
        curl -s http://localhost:3000/reports/$JOB_ID | jq
        echo ""

        echo "🎉 Test complete!"
        echo ""
        echo "Check the output:"
        echo "  open /Users/djioni/Desktop/slides_AR_test.pptx"
        exit 0
    fi

    if [[ "$STATUS" == failed* ]]; then
        echo ""
        echo "❌ Job failed:"
        echo "$STATUS_RESPONSE" | jq
        exit 1
    fi

    sleep 5
    ELAPSED=$((ELAPSED + 5))
done

echo ""
echo "⏱️  Timeout waiting for job to complete"
echo "Check manually: curl http://localhost:3000/status/$JOB_ID | jq"
exit 1
