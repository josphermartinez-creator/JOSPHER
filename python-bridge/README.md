# Quantum Bot - Puente Python ↔ IQ Options

Este script te permite conectar el bot Next.js a tu cuenta real de IQ Options ejecutándose desde tu PC.

## 📋 Requisitos

- Python 3.8+
- Cuenta de IQ Options
- Las librerías de Python (ya las tienes instaladas)

## 🚀 Instalación rápida

### 1. Instalar dependencias (si no las tienes)

```bash
pip install iqoptionapi flask flask-cors
```

### 2. Ejecutar el puente Python

```bash
cd python-bridge
python iqoption_bridge.py
```

Verás algo como:
```
============================================================
  Quantum Bot - Puente Python ↔ IQ Options
============================================================

  Puerto: 5000
  Estado: Esperando conexiones del bot Next.js

  El bot Next.js (iqoption-service) detectará automáticamente
  este puente en http://localhost:5000

  Pasos:
    1. Ejecuta este script: python iqoption_bridge.py
    2. Inicia el bot Next.js (bun run dev)
    3. En el bot, inicia sesión con tus credenciales de IQ Options
    4. El bot usará datos REALES automáticamente
============================================================
 * Running on http://0.0.0.0:5000/
```

### 3. Iniciar el bot Next.js

En otra terminal:

```bash
bash scripts/start-all.sh
```

### 4. Iniciar sesión en el bot

Abre http://localhost:3000 y:
1. Ingresa tu email y contraseña de IQ Options
2. Selecciona PRACTICE o REAL
3. Click en "Conectar con IQ Options"

El bot detectará automáticamente el puente Python y usará:
- ✅ Velas reales de IQ Options
- ✅ Balance real de tu cuenta
- ✅ Órdenes reales en el broker

## 🔧 Cómo funciona

```
[Tu PC]
├── python iqoption_bridge.py  (puerto 5000)
│   └── Se conecta a IQ Options vía WebSocket
│   └── Expone API HTTP local
│
├── mini-services/iqoption-service/  (puerto 3003)
│   └── Detecta el puente Python automáticamente
│   └── Si no hay puente, usa modo DEMO
│
└── Next.js app  (puerto 3000)
    └── Interfaz web del bot
    └── Se conecta a iqoption-service
```

## 📊 Endpoints del puente Python

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/health` | GET | Health check + estado conexión |
| `/status` | GET | Estado actual de la conexión |
| `/login` | POST | Login a IQ Options |
| `/logout` | POST | Logout de IQ Options |
| `/candles?pair=EURUSD&count=80` | GET | Obtiene velas OHLC |
| `/assets` | GET | Lista de activos disponibles |
| `/place-order` | POST | Coloca orden binaria |
| `/balance` | GET | Balance actual |
| `/check-result/<order_id>` | GET | Verifica resultado de orden |

## ⚠️ Solución de problemas

### "ERROR: iqoptionapi no instalado"
```bash
pip install iqoptionapi
```

### "ERROR: Flask no instalado"
```bash
pip install flask flask-cors
```

### El bot sigue en modo DEMO
- Verifica que el puente Python esté corriendo (`python iqoption_bridge.py`)
- Verifica que veas `* Running on http://0.0.0.0:5000/`
- El bot verifica la conexión cada 10 segundos, espera

### Error de login
- Verifica tu email y contraseña de IQ Options
- IQ Options puede bloquear logins desde IPs no habituales
- Prueba primero en PRACTICE

### No se detectan velas
- Verifica que el par exista en IQ Options
- Algunos pares OTC solo están disponibles en ciertos horarios
- Revisa los logs del puente Python para ver errores

## 🔄 Modo automático

El bot detecta automáticamente si el puente Python está disponible:
- **Puente activo** → usa datos REALES de IQ Options
- **Puente inactivo** → usa datos DEMO simulados

No necesitas configurar nada, el bot cambia automáticamente.

## 📝 Notas

- El puente Python mantiene la conexión WebSocket con IQ Options
- Si la conexión se pierde, el puente intenta reconectar automáticamente
- Las órdenes reales se colocan directamente en IQ Options
- El balance se actualiza cada 5 segundos
