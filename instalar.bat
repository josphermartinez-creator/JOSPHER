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
echo [1/6] Verificando Node.js...
where node >nul 2>&1
if errorlevel 1 goto :no_node
for /f "tokens=*" %%i in ('node --version 2^>nul') do set NODE_VER=%%i
echo       Node.js %NODE_VER% encontrado - OK
echo.

:: ====== PASO 2: Verificar Python ======
echo [2/6] Verificando Python...
where python >nul 2>&1
if errorlevel 1 goto :no_python
for /f "tokens=*" %%i in ('python --version 2^>nul') do set PY_VER=%%i
echo       %PY_VER% encontrado - OK
echo.

:: ====== PASO 3: Instalar dependencias del bot ======
echo [3/6] Instalando dependencias del bot (puede tardar)...
cd /d "%~dp0"
call npm install
if errorlevel 1 goto :dep_error
echo       Dependencias del bot instaladas - OK
echo.

:: ====== PASO 4: Instalar mini-servicios ======
echo [4/6] Instalando mini-servicios...
echo       - IQ Option service...
cd /d "%~dp0mini-services\iqoption-service"
call npm install
if errorlevel 1 goto :dep_error
echo       - AutoTrader service...
cd /d "%~dp0mini-services\autotrader-service"
call npm install
if errorlevel 1 goto :dep_error
cd /d "%~dp0"
echo       Mini-servicios instalados - OK
echo.

:: ====== PASO 5: Instalar dependencias de Python ======
echo [5/6] Instalando dependencias de Python...
python -m pip install --upgrade requests flask flask-cors websocket-client
echo.
echo       Instalando iqoptionapi desde GitHub...
echo       (la version de PyPI esta abandonada y NO sirve para operar)
python -m pip uninstall -y iqoptionapi >nul 2>&1
python -m pip install https://github.com/iqoptionapi/iqoptionapi/archive/refs/heads/master.zip
if errorlevel 1 goto :py_error

python -c "from iqoptionapi.stable_api import IQ_Option" >nul 2>&1
if errorlevel 1 goto :py_error
echo       Dependencias de Python instaladas - OK
echo.

:: ====== PASO 6: Base de datos ======
:: La ruta de la base de datos esta fijada en prisma/schema.prisma, asi que no
:: hace falta ningun archivo .env.
echo [6/6] Preparando la base de datos...
cd /d "%~dp0"
call npx prisma generate
if errorlevel 1 goto :db_error
call npx prisma db push --accept-data-loss
if errorlevel 1 goto :db_error
echo       Base de datos lista - OK
echo.

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
echo [ERROR] No se pudieron instalar las dependencias de Node.
echo Verifica tu conexion a internet y vuelve a ejecutar instalar.bat
echo.
pause
exit /b 1

:py_error
echo.
echo [ERROR] No se pudo instalar la libreria de IQ Option.
echo.
echo Instalala a mano con:
echo   python -m pip install https://github.com/iqoptionapi/iqoptionapi/archive/refs/heads/master.zip
echo.
pause
exit /b 1

:db_error
echo.
echo [ERROR] No se pudo preparar la base de datos.
echo Haz doble clic en reparar.bat
echo.
pause
exit /b 1
