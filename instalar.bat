@echo off
title Quantum Bot - Instalacion
color 0A
cd /d "%~dp0"

echo.
echo ============================================================
echo   QUANTUM BOT - INSTALACION (SOLO PRIMERA VEZ)
echo ============================================================
echo.

:: ====== PASO 1: Verificar Node.js ======
echo [1/5] Verificando Node.js...
where node >nul 2>&1
if errorlevel 1 goto :no_node
for /f "tokens=*" %%i in ('node --version 2^>nul') do set NODE_VER=%%i
echo       Node.js %NODE_VER% encontrado - OK
echo.

:: ====== PASO 2: Verificar Python ======
echo [2/5] Verificando Python...
where python >nul 2>&1
if errorlevel 1 goto :no_python
for /f "tokens=*" %%i in ('python --version 2^>nul') do set PY_VER=%%i
echo       %PY_VER% encontrado - OK
echo.

:: ====== PASO 3: Instalar dependencias del bot ======
echo [3/5] Instalando dependencias del bot (puede tardar)...
cd /d "%~dp0"
call npm install
if errorlevel 1 goto :dep_error
echo       Dependencias del bot instaladas - OK
echo.

:: ====== PASO 4: Instalar mini-servicios ======
echo [4/5] Instalando mini-servicios...
echo       - IQ Option service...
cd /d "%~dp0mini-services\iqoption-service"
call npm install 2>nul
echo       - AutoTrader service...
cd /d "%~dp0mini-services\autotrader-service"
call npm install 2>nul
cd /d "%~dp0"
echo       Mini-servicios instalados - OK
echo.

:: ====== PASO 5: Instalar dependencias de Python ======
echo [5/5] Instalando dependencias de Python...
python -m pip install iqoptionapi requests flask flask-cors websocket-client
echo       Dependencias de Python instaladas - OK
echo.

:: ====== Configurar base de datos ======
echo [EXTRA] Configurando base de datos...
cd /d "%~dp0"
call npx prisma db push --accept-data-loss 2>nul
call npx prisma generate 2>nul
echo       Base de datos lista - OK
echo.

if not exist "%~dp0db" mkdir "%~dp0db"

echo ============================================================
echo   INSTALACION COMPLETADA!
echo ============================================================
echo.
echo   Ahora puedes ejecutar: arrancar.bat
echo.
pause
exit /b 0

:no_node
echo.
echo [ERROR] Node.js no esta instalado.
echo Descarga Node.js desde: https://nodejs.org/
echo.
pause
exit /b 1

:no_python
echo.
echo [ERROR] Python no esta instalado.
echo Descarga Python desde: https://www.python.org/downloads/
echo IMPORTANTE: Marca "Add Python to PATH" durante la instalacion
echo.
pause
exit /b 1

:dep_error
echo.
echo [ERROR] No se pudieron instalar las dependencias.
echo Verifica tu conexion a internet.
echo.
pause
exit /b 1
