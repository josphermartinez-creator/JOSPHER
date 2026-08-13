#!/bin/bash
# Stop ALL Quantum Bot services
# Usage: bash scripts/stop-all.sh

cd /home/z/my-project

echo "Deteniendo Quantum Bot services..."

# Kill by port
for port in 3000 3003 3004; do
  PIDS=$(ss -tlnp 2>/dev/null | grep ":$port " | grep -oP 'pid=\K[0-9]+' || true)
  if [ -n "$PIDS" ]; then
    for pid in $PIDS; do
      kill -9 $pid 2>/dev/null && echo "  [OK] Proceso $pid detenido (puerto $port)"
    done
  fi
done

# Also kill by name
pkill -9 -f "next-server" 2>/dev/null && echo "  [OK] next-server detenido" || true
pkill -9 -f "bun.*index.ts" 2>/dev/null && echo "  [OK] mini-services detenidos" || true

sleep 2

# Verify
REMAINING=$(ss -tln 2>/dev/null | grep -E ":300[034] " | wc -l)
if [ "$REMAINING" = "0" ]; then
  echo ""
  echo "Todos los servicios detenidos correctamente."
else
  echo ""
  echo "Algunos puertos siguen activos:"
  ss -tln 2>/dev/null | grep -E ":300[034] "
fi
