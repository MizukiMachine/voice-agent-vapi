#!/bin/sh
# Start script for Cloud Run
# Starts both Next.js server and WebSocket server

set -e

echo "Starting Next.js server on port ${PORT:-8080}..."
node /app/standalone/server.js &

echo "Starting WebSocket server on port ${WS_PORT:-3001}..."
node /app/src/websocket-server.js &

# Wait for any process to exit
wait -n
exit_code=$?

echo "One of the processes exited with code $exit_code, shutting down..."
exit $exit_code
