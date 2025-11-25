#!/bin/bash
# Complete dependency installation for RTL PPTX Orchestrator

set -e

echo "🚀 Installing dependencies for RTL PPTX Orchestrator"
echo ""

# ========== System Dependencies ==========
echo "📦 Installing system dependencies..."

# Check if Homebrew is installed
if ! command -v brew &> /dev/null; then
    echo "❌ Homebrew not found. Install from https://brew.sh"
    exit 1
fi

# Redis (required)
if ! command -v redis-server &> /dev/null; then
    echo "  Installing Redis..."
    brew install redis
else
    echo "  ✅ Redis already installed"
fi

# Tesseract (optional, for OCR)
if ! command -v tesseract &> /dev/null; then
    echo "  Installing Tesseract (OCR)..."
    brew install tesseract
else
    echo "  ✅ Tesseract already installed"
fi

# LibreOffice (optional, for PDF rendering)
if ! command -v soffice &> /dev/null; then
    echo "  Installing LibreOffice..."
    brew install --cask libreoffice
else
    echo "  ✅ LibreOffice already installed"
fi

echo ""

# ========== Python Dependencies ==========
echo "🐍 Installing Python dependencies..."

cd /Users/djioni/KSA-AI-TRANSLATE

# Check if venv exists
if [ ! -d ".venv" ]; then
    echo "  Creating Python virtual environment..."
    python3 -m venv .venv
fi

source .venv/bin/activate

# Core dependencies (required)
echo "  Installing core Python packages..."
pip install -q --upgrade pip
pip install -q python-pptx lxml

# OCR dependencies (optional)
echo "  Installing OCR packages (optional)..."
pip install -q pytesseract pymupdf pillow || echo "  ⚠️  OCR packages failed (optional)"

# Vision dependencies (optional)
echo "  Installing Vision QA packages (optional)..."
pip install -q anthropic || echo "  ⚠️  Anthropic package failed (optional)"

echo "  ✅ Python dependencies installed"
echo ""

# ========== Node.js Dependencies ==========
echo "📦 Installing Node.js dependencies..."

cd server

if [ ! -d "node_modules" ]; then
    npm install
else
    echo "  ✅ Node modules already installed"
fi

echo ""

# ========== Configuration ==========
echo "⚙️  Creating configuration..."

# Create .env if it doesn't exist
if [ ! -f ".env" ]; then
    cat > .env << EOF
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
PYTHON_BIN=/Users/djioni/KSA-AI-TRANSLATE/.venv/bin/python
JOBS_DIR=/Users/djioni/KSA-AI-TRANSLATE/jobs
PORT=3000
# ANTHROPIC_API_KEY=sk-ant-your-key-here
EOF
    echo "  ✅ Created .env file"
else
    echo "  ✅ .env file already exists"
fi

# Create jobs directory
mkdir -p /Users/djioni/KSA-AI-TRANSLATE/jobs
echo "  ✅ Created jobs directory"

echo ""

# ========== Start Services ==========
echo "🔧 Starting services..."

# Start Redis
if ! redis-cli ping &> /dev/null; then
    echo "  Starting Redis..."
    brew services start redis
    sleep 2
fi

if redis-cli ping &> /dev/null; then
    echo "  ✅ Redis is running"
else
    echo "  ❌ Redis failed to start"
    exit 1
fi

echo ""

# ========== Build ==========
echo "🔨 Building TypeScript..."
npm run build

echo ""
echo "✅ Installation complete!"
echo ""
echo "📝 Next steps:"
echo "  1. Edit .env and add your ANTHROPIC_API_KEY (optional)"
echo "  2. Start the orchestrator: npm run dev"
echo "  3. Submit a test job (see BULLMQ_SETUP.md)"
echo ""
echo "🧪 Quick test:"
echo "  curl http://localhost:3000/health"
echo ""
