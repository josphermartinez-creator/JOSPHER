# Quantum Bot - Trading de Opciones Binarias

Bot automático de trading para opciones binarias con conexión real a IQ Options.

## 🚀 INICIO RÁPIDO (Windows)

### Primera vez (instalación)
1. Descomprime el ZIP en una carpeta (ej: `C:\QuantumBot`)
2. Doble click en `instalar.bat`
3. Espera a que termine (instala dependencias)

> **Todo se hace con doble click.** No hace falta escribir comandos en la
> consola. Si escribes `npx` a mano en PowerShell, Windows lo bloquea por
> política de scripts; y si lo escribes desde otra carpeta, no encuentra el
> proyecto. Los `.bat` se sitúan solos en la carpeta correcta.

### Si algo falla
1. Doble click en `diagnostico.bat` → te dice qué falta
2. Doble click en `reparar.bat` → lo arregla solo (dependencias, base de datos
   y la librería de IQ Option)

### Cada día (arrancar)
1. Doble click en `arrancar.bat`
2. Se abren 4 ventanas (no las cierres)
3. El navegador abre automáticamente en http://localhost:3000
4. **Inicia sesión con tu email y contraseña de IQ Options**
5. El bot se conecta a tu cuenta real y muestra tu balance real

### Detener
- Doble click en `detener.bat`
- O cierra las 4 ventanas

---

## 🔑 Cómo funciona la conexión a IQ Options

```
[Tu PC Windows]
├── arrancar.bat inicia 4 servicios:
│   │
│   ├── 1. Puente Python (puerto 5005)
│   │   └── Se conecta a IQ Options vía WebSocket
│   │   └── Usa la librería iqoptionapi (que ya tienes)
│   │   └── Ejecuta órdenes REALES en el broker
│   │
│   ├── 2. IQ Option service (puerto 3003)
│   │   └── Habla con el puente Python
│   │
│   ├── 3. AutoTrader (puerto 3004)
│   │   └── Monitorea señales y ejecuta operaciones
│   │
│   └── 4. Next.js (puerto 3000)
│       └── La interfaz web que ves en el navegador
```

**Cuando inicias sesión en el bot:**
1. El bot envía tus credenciales al puente Python
2. El puente Python se conecta a IQ Options con `iqoptionapi`
3. Obtiene tu balance REAL de tu cuenta demo/real
4. Las velas que ve el bot son REALES de IQ Options
5. Las operaciones que ejecuta el bot entran en el broker REAL

---

## 📋 Requisitos

- **Windows 10/11**
- **Node.js 22+** → https://nodejs.org/ (versión LTS)
- **Python 3.8+** → https://www.python.org/downloads/
  - ⚠️ Marca "Add Python to PATH" al instalar
- **Librerías Python** (se instalan con `instalar.bat`):
  - `iqoptionapi`
  - `requests`
  - `websocket-client`
  - `flask`
  - `flask-cors`

---

## 🎯 Cómo usar el bot

### 1. Iniciar sesión (conecta a IQ Options real)
- Abre http://localhost:3000
- Email y contraseña de IQ Options
- Selecciona **Práctica** o **Real**
- Click en **"Conectar con IQ Options"**
- Verás tu balance REAL de IQ Options

### 2. Configurar Telegram (opcional)
- Pestaña **Telegram**
- Pega tu Bot Token (de @BotFather)
- Pega tu Chat ID (de @userinfobot)
- Click en **"Verificar token"**
- Click en **"Guardar"**

### 3. Seleccionar pares
- Pestaña **Pares**
- Selecciona los pares que quieres operar (máximo 10)
- Click en **"Guardar selección"**

### 4. Iniciar bot automático
- Vuelve al **Dashboard**
- Click en **"INICIAR AUTO"** (botón verde)
- El bot monitorea los pares y ejecuta operaciones REALES en IQ Options

---

## 🔧 Puertos utilizados

| Servicio | Puerto | Descripción |
|----------|--------|-------------|
| Bot Next.js | 3000 | Interfaz web |
| IQ Option service | 3003 | Servicio intermedio |
| AutoTrader | 3004 | Bot automático |
| Python Bridge | 5005 | Conexión a IQ Options real |

**Nota**: El puerto 5005 no interfiere con tu otro bot (que usa el 5000).

---

## ⚠️ Solución de problemas

### El bot no conecta a IQ Options
1. Verifica que el puente Python esté corriendo (ventana "QuantumBot-Python")
2. Verifica tu email y contraseña de IQ Options
3. IQ Options puede bloquear logins desde IPs nuevas (espera 24h)
4. Prueba primero en modo Práctica

### La pantalla negra se cierra rápido
1. Abre CMD
2. Navega a la carpeta del bot: `cd C:\QuantumBot`
3. Ejecuta: `instalar.bat`
4. Verás el error completo

### El bot dice "AUTO · INICIANDO" y no pasa a "EN VIVO"
- Espera 10-15 segundos a que el AutoTrader se conecte
- Si no cambia, ejecuta `detener.bat` y vuelve a `arrancar.bat`

### Python no encontrado
- Reinstala Python marcando "Add Python to PATH"
- Reinicia el PC
- Verifica con: `python --version` en CMD

### Error "iqoptionapi no instalado"
```
pip install iqoptionapi requests websocket-client
```

---

## 📝 Notas importantes

- **El bot ejecuta operaciones REALES** cuando conectas con tu cuenta de IQ Options
- **Empieza siempre en modo Práctica** para probar
- El balance que ves es el real de tu cuenta de IQ Options
- Las operaciones aparecen en el historial de IQ Options
- El puerto 5005 es para el puente Python (no interfiere con tu otro bot)
