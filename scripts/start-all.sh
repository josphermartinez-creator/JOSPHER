#!/bin/bash
# Arranca todos los servicios de Quantum Bot (Linux / macOS)
# Uso: bash scripts/start-all.sh
#
# El equivalente en Windows es arrancar.bat

set -u

# Raiz del proyecto, calculada desde la ubicacion de este script.
# (Antes estaba fijo a /home/z/my-project, la ruta de la maquina donde se genero
#  el proyecto, asi que fuera de alli no arrancaba nada.)
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

LOG_DIR="$ROOT/logs"
mkdir -p "$LOG_DIR"

# Runner de Node: bun si existe, si no npx tsx
if command -v bun >/dev/null 2>&1; then
  RUN_TS="bun"
  RUN_APP="bun run dev"
else
  RUN_TS="npx tsx"
  RUN_APP="npm run dev"
fi

PYTHON_BIN="${PYTHON_BIN:-python3}"
command -v "$PYTHON_BIN" >/dev/null 2>&1 || PYTHON_BIN=python

echo "============================================"
echo "  Quantum Bot - Inicio completo"
echo "  Proyecto: $ROOT"
echo "============================================"
echo ""

# ---------- 1. Limpiar ----------
echo "[1/6] Limpiando procesos anteriores..."
for port in 3000 3003 3004 5005; do
  PIDS=$(ss -tlnp 2>/dev/null | grep ":$port " | grep -oP 'pid=\K[0-9]+' || true)
  for pid in $PIDS; do kill -9 "$pid" 2>/dev/null || true; done
done
sleep 2
echo "      OK"
echo ""

# ---------- 2. Puente Python ----------
echo "[2/6] Iniciando puente Python (5005)..."
if [ ! -f "$ROOT/python-bridge/iqoption_bridge.py" ]; then
  echo "      [ERROR] Falta python-bridge/iqoption_bridge.py"
  exit 1
fi

nohup "$PYTHON_BIN" "$ROOT/python-bridge/iqoption_bridge.py" > "$LOG_DIR/python-bridge.log" 2>&1 &
disown

# Sin puente NO se opera: se espera a que responda de verdad.
BRIDGE_OK=0
for _ in $(seq 1 20); do
  if curl -s --max-time 2 http://localhost:5005/health >/dev/null 2>&1; then
    BRIDGE_OK=1
    break
  fi
  sleep 1
done

if [ "$BRIDGE_OK" != "1" ]; then
  echo "      [ERROR] El puente Python no responde en http://localhost:5005/health"
  echo "      Revisa $LOG_DIR/python-bridge.log"
  echo "      Suele ser que falta: pip install flask flask-cors"
  echo "      y la libreria: pip install https://github.com/iqoptionapi/iqoptionapi/archive/refs/heads/master.zip"
  exit 1
fi
echo "      [OK] puente respondiendo"
echo ""

# ---------- 3. Servicio IQ Option ----------
echo "[3/6] Iniciando servicio IQ Option (3003)..."
cd "$ROOT/mini-services/iqoption-service"
nohup $RUN_TS index.ts > "$LOG_DIR/iq-service.log" 2>&1 &
disown
cd "$ROOT"
sleep 4
echo "      [OK]"
echo ""

# ---------- 4. AutoTrader ----------
echo "[4/6] Iniciando AutoTrader (3004)..."
cd "$ROOT/mini-services/autotrader-service"
nohup $RUN_TS index.ts > "$LOG_DIR/autotrader.log" 2>&1 &
disown
cd "$ROOT"
sleep 4
echo "      [OK]"
echo ""

# ---------- 5. Next.js ----------
echo "[5/6] Iniciando la app (3000)..."
nohup $RUN_APP > "$LOG_DIR/app.log" 2>&1 &
disown
sleep 10
echo "      [OK]"
echo ""

# ---------- 6. Verificacion ----------
echo "[6/6] Verificando..."
sleep 2
OK=0
check_port () {
  if ss -tln 2>/dev/null | grep -q ":$1 "; then
    echo "  [OK]   puerto $1 - $2"
    OK=$((OK+1))
  else
    echo "  [FALLO] puerto $1 - $2"
  fi
}
check_port 5005 "Puente Python"
check_port 3003 "Servicio IQ Option"
check_port 3004 "AutoTrader"
check_port 3000 "App Next.js"

echo ""
echo "============================================"
if [ "$OK" = "4" ]; then
  echo "  TODO LISTO -> http://localhost:3000"
  echo ""
  echo "  Logs en $LOG_DIR/"
  echo "  Para detener: bash scripts/stop-all.sh"
else
  echo "  Faltan servicios ($OK/4). Revisa los logs en $LOG_DIR/"
fi
echo "============================================"
