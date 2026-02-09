#!/bin/bash
set -e

echo "=========================================="
echo "WebRTC Dependencies Setup Script"
echo "=========================================="
echo ""

# ============================================================
# Node.js Version Check
# ============================================================

NODE_VERSION=$(node -v)
echo "✓ Node.js version: $NODE_VERSION"

# Check if Node.js version is 18 or higher
NODE_MAJOR_VERSION=$(echo $NODE_VERSION | cut -d. -f1 | sed 's/v//')
if [ "$NODE_MAJOR_VERSION" -lt 18 ]; then
    echo "❌ Error: Node.js 18 or higher is required"
    echo "   Current version: $NODE_VERSION"
    echo "   Please upgrade Node.js: https://nodejs.org/"
    exit 1
fi

# ============================================================
# Install npm Dependencies
# ============================================================

echo ""
echo "📦 Installing npm packages..."
if command -v pnpm &> /dev/null; then
    pnpm install
elif command -v yarn &> /dev/null; then
    yarn install
else
    npm install
fi
echo "✓ npm packages installed"

# ============================================================
# Check for ffmpeg (Audio Conversion)
# ============================================================

echo ""
echo "🎵 Checking for ffmpeg..."
if command -v ffmpeg &> /dev/null; then
    FFMPEG_VERSION=$(ffmpeg -version 2>&1 | head -n1)
    echo "✓ ffmpeg found: $FFMPEG_VERSION"
else
    echo "⚠️  Warning: ffmpeg not found"
    echo "   Audio conversion may not work properly."
    echo ""
    echo "   Install with:"
    echo "   - macOS:   brew install ffmpeg"
    echo "   - Ubuntu:  sudo apt install ffmpeg"
    echo "   - Windows: choco install ffmpeg"
    echo ""
fi

# ============================================================
# Environment Variables Setup
# ============================================================

echo ""
echo "🔐 Setting up environment variables..."

if [ ! -f .env.local ]; then
    if [ -f .env.local.example ]; then
        echo "Creating .env.local from template..."
        cp .env.local.example .env.local
        echo "✓ .env.local created"
        echo ""
        echo "⚠️  IMPORTANT: Edit .env.local and add your API keys:"
        echo "   - VAPI_API_KEY"
        echo "   - VAPI_PUBLIC_KEY"
        echo "   - VAPI_ASSISTANT_ID"
        echo "   - CARTESIA_API_KEY"
        echo "   - CARTESIA_VOICE_ID"
    else
        echo "⚠️  Warning: .env.local.example not found"
        echo "   Creating minimal .env.local..."
        cat > .env.local << EOF
# Vapi Configuration
VAPI_API_KEY=your_vapi_api_key_here
VAPI_PUBLIC_KEY=your_vapi_public_key_here
VAPI_ASSISTANT_ID=your_assistant_id_here

# Cartesia Configuration
CARTESIA_API_KEY=your_cartesia_api_key_here
CARTESIA_VOICE_ID=79a125e8-cd45-4c05-9a83-4b0d4b0f3c29
CARTESIA_DEFAULT_SPEED=1.0
EOF
        echo "✓ .env.local created (please add your API keys)"
    fi
else
    echo "✓ .env.local already exists"
fi

# ============================================================
# Test Environment Check
# ============================================================

echo ""
echo "🧪 Running test environment check..."

# Check if Jest is available
if npx jest --version &> /dev/null; then
    JEST_VERSION=$(npx jest --version)
    echo "✓ Jest available: $JEST_VERSION"
else
    echo "⚠️  Warning: Jest not found"
fi

# ============================================================
# Summary
# ============================================================

echo ""
echo "=========================================="
echo "✅ Setup Complete!"
echo "=========================================="
echo ""
echo "Next Steps:"
echo "  1. Edit .env.local with your API keys"
echo "  2. Run tests: npm test"
echo "  3. Start dev server: npm run dev"
echo ""
echo "For more information, see docs/WEBRTC_SETUP.md"
echo ""
