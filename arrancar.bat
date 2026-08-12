@echo off
setlocal enabledelayedexpansion
title Quantum Bot - Iniciando...
color 0B
cd /d "%~dp0"

echo.
echo ============================================================
echo   QUANTUM BOT - ARRANCANDO
echo ============================================================
echo.

if not exist "node_modules" goto :no_install

:: ====== PASO 1: Limpiar procesos anteriores ======
echo [1/6] Limpiando procesos anteriores...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING" 2^>nul') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3003 " ^| findstr "LISTENING" 2^>nul') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3004 " ^| findstr "LISTENING" 2^>nul') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5005 " ^| findstr "LISTENING" 2^>nul') do taskkill /PID %%a /F >nul 2>&1
echo       OK
echo.

:: ====== PASO 2: Iniciar puente Python ======
:: Sin puente el bot NO puede operar: ya no hay modo demo silencioso.
echo [2/6] Iniciando puente Python (5005)...
if not exist "%~dp0python-bridge\iqoption_bridge.py" goto :no_bridge
start "QuantumBot-Python" /min cmd /c "cd /d "%~dp0python-bridge" && python iqoption_bridge.py"
echo.

:: ====== PASO 3: Esperar a que el puente responda de verdad ======
echo [3/6] Esperando al puente Python...
set BRIDGE_OK=0
for /l %%i in (1,1,20) do (
    if !BRIDGE_OK!==0 (
        curl -s --max-time 2 http://localhost:5005/health >nul 2>&1
        if !errorlevel!==0 (
            set BRIDGE_OK=1
        ) else (
            timeout /t 1 /nobreak >nul
        )
    )
)
if "%BRIDGE_OK%"=="0" goto :bridge_slow
echo       [OK] El puente responde
goto :bridge_done

:bridge_slow
echo       [AVISO] El puente aun no responde en http://localhost:5005/health
echo       Mira la ventana "QuantumBot-Python" para ver el error.
echo       Lo mas habitual: falta instalar la libreria.
echo         pip install flask flask-cors
echo         pip install https://github.com/iqoptionapi/iqoptionapi/archive/refs/heads/master.zip
echo.
echo       SIN PUENTE EL BOT NO PUEDE OPERAR (no hay modo demo).
echo.
pause

:bridge_done
echo.

:: ====== PASO 4: Servicio IQ Option ======
echo [4/6] Iniciando servicio IQ Option (3003)...
start "QuantumBot-IQService" /min cmd /c "cd /d "%~dp0mini-services\iqoption-service" && npx tsx index.ts"
timeout /t 4 /nobreak >nul
echo       OK
echo.

:: ====== PASO 5: AutoTrader ======
echo [5/6] Iniciando AutoTrader (3004)...
start "QuantumBot-AutoTrader" /min cmd /c "cd /d "%~dp0mini-services\autotrader-service" && npx tsx index.ts"
timeout /t 4 /nobreak >nul
echo       OK
echo.

:: ====== PASO 6: App Next.js ======
echo [6/6] Iniciando la app (3000)...
start "QuantumBot-NextJS" cmd /k "cd /d "%~dp0" && npm run dev"
echo       OK
echo.

echo ============================================================
echo   TODO INICIADO
echo ============================================================
echo.
echo   Abre: http://localhost:3000
echo   El navegador se abrira en 15 segundos...
echo.
timeout /t 15 /nobreak >nul
start http://localhost:3000
echo.
echo   Pulsa una tecla para cerrar esta ventana
echo   (los servicios siguen corriendo)
pause >nul
exit /b 0

:no_bridge
echo       [ERROR] No se encuentra python-bridge\iqoption_bridge.py
echo       El bot no puede operar sin el puente.
pause
exit /b 1

:no_install
echo [ERROR] El bot no esta instalado.
echo Ejecuta primero: instalar.bat
echo.
pause
exit /b 1
