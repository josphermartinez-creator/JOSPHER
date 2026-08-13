@echo off
setlocal enabledelayedexpansion
title Quantum Bot - Diagnostico
color 0E
cd /d "%~dp0"

set FALLOS=0

echo.
echo ============================================================
echo   QUANTUM BOT - DIAGNOSTICO
echo ============================================================
echo.

echo [1] Node.js
where node >nul 2>&1
if errorlevel 1 (
    echo     [FALTA] Instala desde https://nodejs.org/
    set /a FALLOS+=1
) else (
    for /f "tokens=*" %%i in ('node --version 2^>nul') do echo     [OK] %%i
)
echo.

echo [2] Python
where python >nul 2>&1
if errorlevel 1 (
    echo     [FALTA] Instala desde https://www.python.org/downloads/
    set /a FALLOS+=1
) else (
    for /f "tokens=*" %%i in ('python --version 2^>nul') do echo     [OK] %%i
)
echo.

echo [3] Libreria iqoptionapi
python -c "from iqoptionapi.stable_api import IQ_Option" >nul 2>&1
if errorlevel 1 (
    echo     [FALTA o MAL INSTALADA]
    echo     La version de PyPI no sirve. Instala la de GitHub:
    echo       python -m pip uninstall -y iqoptionapi
    echo       python -m pip install https://github.com/iqoptionapi/iqoptionapi/archive/refs/heads/master.zip
    set /a FALLOS+=1
) else (
    echo     [OK] se puede importar
)
echo.

echo [4] Flask (lo necesita el puente)
python -c "import flask, flask_cors" >nul 2>&1
if errorlevel 1 (
    echo     [FALTA] python -m pip install flask flask-cors
    set /a FALLOS+=1
) else (
    echo     [OK]
)
echo.

echo [5] node_modules del bot
if exist "node_modules" (echo     [OK]) else (
    echo     [FALTA] Ejecuta instalar.bat
    set /a FALLOS+=1
)
echo.

echo [6] node_modules de los mini-servicios
if exist "mini-services\iqoption-service\node_modules" (
    echo     [OK] iqoption-service
) else (
    echo     [FALTA] iqoption-service - ejecuta instalar.bat
    set /a FALLOS+=1
)
if exist "mini-services\autotrader-service\node_modules" (
    echo     [OK] autotrader-service
) else (
    echo     [FALTA] autotrader-service - ejecuta instalar.bat
    set /a FALLOS+=1
)
echo.

echo [7] Archivo .env
:: Sin DATABASE_URL, Prisma falla en toda consulta y el login da error.
if exist ".env" (
    findstr /C:"DATABASE_URL" ".env" >nul 2>&1
    if errorlevel 1 (
        echo     [MAL] .env existe pero no tiene DATABASE_URL
        echo     Añade esta linea:  DATABASE_URL="file:./db/custom.db"
        set /a FALLOS+=1
    ) else (
        echo     [OK] .env con DATABASE_URL
    )
) else (
    echo     [FALTA] No existe .env - es la causa mas comun del
    echo     "Error al iniciar sesion". Ejecuta instalar.bat, o crealo a mano
    echo     con esta unica linea:  DATABASE_URL="file:./db/custom.db"
    set /a FALLOS+=1
)
echo.

echo [8] Base de datos
if exist "db\custom.db" (
    echo     [OK] db\custom.db
) else (
    echo     [FALTA] Ejecuta:  npx prisma db push
    set /a FALLOS+=1
)
echo.

echo [9] Puente Python (puerto 5005)
curl -s --max-time 3 http://localhost:5005/health >nul 2>&1
if errorlevel 1 (
    echo     [PARADO] Arranca con arrancar.bat
) else (
    echo     [OK] responde
    curl -s --max-time 3 http://localhost:5005/health
    echo.
)
echo.

echo [10] Servicios
call :puerto 3000 "App (Next.js)"
call :puerto 3003 "Servicio IQ Option"
call :puerto 3004 "AutoTrader"
call :puerto 5005 "Puente Python"
echo.

echo ============================================================
if "%FALLOS%"=="0" (
    echo   TODO CORRECTO
    echo   Si aun asi falla el login, mira la ventana QuantumBot-Python:
    echo   ahi aparece el motivo exacto que devuelve IQ Option.
) else (
    echo   %FALLOS% PROBLEMA^(S^) ENCONTRADO^(S^) - revisa los [FALTA] de arriba
)
echo ============================================================
echo.
pause
exit /b 0

:puerto
netstat -ano | findstr ":%~1 " | findstr "LISTENING" >nul 2>&1
if errorlevel 1 (echo     [PARADO]    puerto %~1 - %~2) else (echo     [CORRIENDO] puerto %~1 - %~2)
exit /b 0
