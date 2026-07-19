#!/bin/bash
set -e
cd "$(dirname "$0")"

rm -f api.out client.out

node fake-external-api.js > api.out 2>&1 &
API_PID=$!
sleep 1

node client.js > client.out 2>&1
sleep 0.5

kill "$API_PID" 2>/dev/null || true
sleep 0.3

echo "=== api.out ==="
cat api.out
echo "=== client.out ==="
cat client.out
