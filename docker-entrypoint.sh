#!/bin/sh
# Start script for Cloud Run
# Starts the Next.js server with integrated WebSocket support

set -e

echo "Starting Next.js server on port ${PORT:-8080}..."
echo "WebSocket endpoint: ws://localhost:${PORT:-8080}/api/webrtc"

# Start the custom Next.js server (WebSocket support is integrated)
exec node /app/standalone/server.js
