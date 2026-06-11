#!/usr/bin/env bash

BACKEND_PORT=8000
FRONTEND_PORT=3000

PYTHON=$(command -v python3 || command -v python || echo "")

if [ -z "$PYTHON" ]; then
  echo "Error: python not found. Install Python 3."
  exit 1
fi

echo "Stopping existing servers on ports $BACKEND_PORT and $FRONTEND_PORT..."

kill_port() {
  local port=$1
  fuser -k "$port"/tcp 2>/dev/null && echo "Killed process on port $port" || true
}

kill_port $BACKEND_PORT
kill_port $FRONTEND_PORT
sleep 1

echo "Starting Backend (FastAPI)..."
"$PYTHON" -m uvicorn backend.main:app --reload --host 0.0.0.0 --port "$BACKEND_PORT" &
BACKEND_PID=$!

echo "Starting Frontend (Next.js)..."
(cd web && npx next dev --hostname 0.0.0.0 --port "$FRONTEND_PORT") &
FRONTEND_PID=$!

echo ""
echo "Both servers started!"
echo "  Backend:  http://127.0.0.1:$BACKEND_PORT"
echo "  Frontend: http://localhost:$FRONTEND_PORT"
echo ""
echo "Stop with: kill $BACKEND_PID $FRONTEND_PID"
echo ""

wait
