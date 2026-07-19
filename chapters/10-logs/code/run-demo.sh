#!/bin/bash
set -e
cd "$(dirname "$0")"

rm -f gateway.log backend.log gateway.out backend.out

node backend.js > backend.out 2>&1 &
BACKEND_PID=$!
sleep 1

node gateway.js > gateway.out 2>&1 &
GATEWAY_PID=$!
sleep 1

echo "=== sending 3 checkout requests ==="
curl -s localhost:9000/checkout > /dev/null
curl -s localhost:9000/checkout > /dev/null
curl -s localhost:9000/checkout > /dev/null
sleep 1.5

kill "$BACKEND_PID" "$GATEWAY_PID" 2>/dev/null || true
sleep 0.3

echo "=== gateway.log ==="
cat gateway.log
echo "=== backend.log ==="
cat backend.log

echo ""
echo "=== picking one trace_id from gateway.log and grepping both files ==="
TRACE_ID=$(grep -o 'trace_id=[a-f0-9]*' gateway.log | head -1 | cut -d= -f2)
echo "trace_id=$TRACE_ID"
grep "trace_id=$TRACE_ID" gateway.log backend.log
