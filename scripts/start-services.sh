#!/bin/bash
# Start mini-services for Quantum Bot
# Usage: bash scripts/start-services.sh

set -e

cd /home/z/my-project

echo "=== Iniciando Quantum Bot Services ==="
echo ""

# Kill existing instances (multiple methods for reliability)
echo "[1/4] Deteniendo servicios anteriores..."
pkill -f "iqoption-service/index.ts" 2>/dev/null || true
pkill -f "autotrader-service/index.ts" 2>/dev/null || true

# Also kill by PID file if exists
if [ -f /tmp/iq-service.pid ]; then
  kill -9 $(cat /tmp/iq-service.pid) 2>/dev/null || true
  rm -f /tmp/iq-service.pid
fi
if [ -f /tmp/autotrader.pid ]; then
  kill -9 $(cat /tmp/autotrader.pid) 2>/dev/null || true
  rm -f /tmp/autotrader.pid
fi

# Wait for ports to be released
sleep 3

# Start IQ Option service
echo "[2/4] Iniciando IQ Option service (puerto 3003)..."
cd /home/z/my-project/mini-services/iqoption-service
nohup bun index.ts > /tmp/iq-service.log 2>&1 &
IQ_PID=$!
echo $IQ_PID > /tmp/iq-service.pid
disown

# Start AutoTrader service
echo "[3/4] Iniciando AutoTrader service (puerto 3004)..."
cd /home/z/my-project/mini-services/autotrader-service
nohup bun index.ts > /tmp/autotrader.log 2>&1 &
AT_PID=$!
echo $AT_PID > /tmp/autotrader.pid
disown

# Wait for services to start
sleep 4

# Verify
echo "[4/4] Verificando servicios..."
echo ""

IQ_OK=false
AT_OK=false

if kill -0 $IQ_PID 2>/dev/null; then
  IQ_OK=true
  echo "  [OK] IQ Option service running (PID: $IQ_PID, port 3003)"
else
  echo "  [FAIL] IQ Option service failed to start"
  echo "  Log:"
  tail -5 /tmp/iq-service.log 2>/dev/null | sed 's/^/    /'
fi

if kill -0 $AT_PID 2>/dev/null; then
  AT_OK=true
  echo "  [OK] AutoTrader service running (PID: $AT_PID, port 3004)"
else
  echo "  [FAIL] AutoTrader service failed to start"
  echo "  Log:"
  tail -5 /tmp/autotrader.log 2>/dev/null | sed 's/^/    /'
fi

echo ""
if [ "$IQ_OK" = true ] && [ "$AT_OK" = true ]; then
  echo "=== Todos los servicios estan corriendo ==="
  echo ""
  echo "Ahora puedes iniciar Next.js con:"
  echo "  cd /home/z/my-project && bun run dev"
  echo ""
  echo "O usa el comando unificado:"
  echo "  bash scripts/start-all.sh"
else
  echo "=== Algunos servicios fallaron ==="
  echo "Revisa los logs en /tmp/iq-service.log y /tmp/autotrader.log"
  exit 1
fi
