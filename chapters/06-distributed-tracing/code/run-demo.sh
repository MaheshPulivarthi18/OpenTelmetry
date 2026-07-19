#!/bin/bash
set -e
cd "$(dirname "$0")"

rm -f queue.out notifications.out backend.out gateway.out

node queue.js > queue.out 2>&1 &
QUEUE_PID=$!
sleep 1

node notifications.js > notifications.out 2>&1 &
NOTIF_PID=$!
sleep 1

node backend.js > backend.out 2>&1 &
BACKEND_PID=$!
sleep 1

node gateway.js > gateway.out 2>&1 &
GATEWAY_PID=$!
sleep 1

echo "=== sending curl ==="
curl -s localhost:9000/checkout
echo ""

echo "=== waiting for notifications poll cycle (3.5s) ==="
sleep 3.5

kill "$QUEUE_PID" "$NOTIF_PID" "$BACKEND_PID" "$GATEWAY_PID" 2>/dev/null || true
sleep 0.5

echo "=== queue.out ==="
cat queue.out
echo "=== gateway.out ==="
cat gateway.out
echo "=== backend.out ==="
cat backend.out
echo "=== notifications.out ==="
cat notifications.out
