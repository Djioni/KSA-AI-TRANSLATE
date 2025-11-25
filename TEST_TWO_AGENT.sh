#!/bin/bash
# Test script for two-agent pipeline
# Run this AFTER restarting the server

set -e

echo "🧪 Testing Two-Agent Pipeline..."
echo ""

# Check server is running
if ! curl -s http://localhost:3000/health > /dev/null; then
    echo "❌ Server not running!"
    echo "Please restart server:"
    echo "  cd /Users/djioni/KSA-AI-TRANSLATE/server"
    echo "  export PYTHON_BIN='/Users/djioni/KSA-AI-TRANSLATE/.venv/bin/python'"
    echo "  npm run dev"
    exit 1
fi

echo "✅ Server is running"
echo ""

# Test the two-agent endpoint
echo "📤 Uploading PPTX and running both agents..."

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
  -o /Users/djioni/Desktop/slides_AR_TWO_AGENT.pptx

echo ""
echo "✅ Done! Check: /Users/djioni/Desktop/slides_AR_TWO_AGENT.pptx"
echo ""
echo "Expected fixes:"
echo "  ✅ Arabic text with proper RTL"
echo "  ✅ Visible text (no white-on-white)"
echo "  ✅ Right-aligned paragraphs"
echo "  ✅ Icons positioned correctly"
echo ""
echo "If issues remain, we'll add OCR validation next."
