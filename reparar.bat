@echo off
title Quantum Bot - Reparar
color 0D
cd /d "%~dp0"

:: Este archivo se ejecuta con DOBLE CLIC. No hay que escribir nada.
:: Se situa solo en la carpeta correcta (%~dp0), asi que da igual desde donde
:: se abra: no puede fallar por estar en la carpeta equivocada.

echo.
echo ============================================================
echo   QUANTUM BOT - REPARAR
echo ============================================================
echo.
echo   Carpeta: %~dp0
echo.
echo   Esto deja el bot listo para arrancar. Puede tardar unos minutos.
echo.
pause

:: ====== 1. Parar todo lo que este corriendo ======
echo.
echo [1/5] Parando servicios...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING" 2^>nul') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3003 " ^| findstr "LISTENING" 2^>nul') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3004 " ^| findstr "LISTENING" 2^>nul') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5005 " ^| findstr "LISTENING" 2^>nul') do taskkill /PID %%a /F >nul 2>&1
echo       OK
echo.

:: ====== 2. Dependencias de Node ======
echo [2/5] Dependencias del bot...
if exist "node_modules" goto :node_ok
call npm install
if errorlevel 1 goto :error_node
:node_ok
if exist "mini-services\iqoption-service\node_modules" goto :iq_ok
cd /d "%~dp0mini-services\iqoption-service"
call npm install
if errorlevel 1 goto :error_node
:iq_ok
if exist "%~dp0mini-services\autotrader-service\node_modules" goto :at_ok
cd /d "%~dp0mini-services\autotrader-service"
call npm install
if errorlevel 1 goto :error_node
:at_ok
cd /d "%~dp0"
echo       OK
echo.

:: ====== 3. Base de datos ======
:: La ruta esta fijada en prisma/schema.prisma: no hace falta ningun .env.
echo [3/5] Base de datos...
call npx prisma generate
if errorlevel 1 goto :error_bd
call npx prisma db push --accept-data-loss
if errorlevel 1 goto :error_bd
echo       OK - prisma\db\custom.db
echo.

:: ====== 4. Libreria de IQ Option ======
:: La version de PyPI esta abandonada y NO sirve para operar: hay que usar la
:: de GitHub, que es la que espera el puente.
echo [4/5] Libreria de IQ Option (Python)...
python -m pip install --quiet --upgrade requests flask flask-cors websocket-client
python -c "from iqoptionapi.stable_api import IQ_Option" >nul 2>&1
if not errorlevel 1 goto :py_ok
echo       Instalando desde GitHub (tarda un poco)...
python -m pip uninstall -y iqoptionapi >nul 2>&1
python -m pip install https://github.com/iqoptionapi/iqoptionapi/archive/refs/heads/master.zip
python -c "from iqoptionapi.stable_api import IQ_Option" >nul 2>&1
if errorlevel 1 goto :error_py
:py_ok
echo       OK
echo.

:: ====== 5. Comprobacion final ======
echo [5/5] Comprobando...
set PROBLEMAS=0
if not exist "node_modules" set PROBLEMAS=1
if not exist "mini-services\iqoption-service\node_modules" set PROBLEMAS=1
if not exist "mini-services\autotrader-service\node_modules" set PROBLEMAS=1
if not exist "prisma\db\custom.db" set PROBLEMAS=1
python -c "from iqoptionapi.stable_api import IQ_Option" >nul 2>&1
if errorlevel 1 set PROBLEMAS=1

echo.
echo ============================================================
if "%PROBLEMAS%"=="0" (
    echo   TODO LISTO
    echo.
    echo   Ahora haz doble clic en:  arrancar.bat
) else (
    echo   Quedan cosas sin resolver. Ejecuta diagnostico.bat
    echo   para ver exactamente cual.
)
echo ============================================================
echo.
pause
exit /b 0

:error_node
echo.
echo [ERROR] Fallo la instalacion de dependencias de Node.
echo Comprueba tu conexion a internet y vuelve a ejecutar reparar.bat
echo.
pause
exit /b 1

:error_bd
echo.
echo [ERROR] Fallo la base de datos.
echo Pasa una foto de esta ventana para saber que dice exactamente.
echo.
pause
exit /b 1

:error_py
echo.
echo [ERROR] No se pudo instalar la libreria de IQ Option.
echo.
echo Comprueba que Python este instalado y en el PATH:
echo   python --version
echo.
pause
exit /b 1
