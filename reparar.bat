@echo off
title Quantum Bot - Reparar
color 0D
cd /d "%~dp0"

:: Se ejecuta con DOBLE CLIC. No hay que escribir nada.
:: Se situa solo en su carpeta (%~dp0), asi que da igual desde donde se abra.

:: ------------------------------------------------------------------
:: Proxy / VPN
:: Los programas de VPN suelen dejar un proxy SOCKS en las variables de
:: entorno, y pip falla con "Missing dependencies for SOCKS support" porque
:: necesita la libreria PySocks para hablar con proxies SOCKS.
:: Se limpian SOLO dentro de esta ventana: no toca la configuracion del
:: sistema ni apaga la VPN.
:: ------------------------------------------------------------------
set "ALL_PROXY="
set "all_proxy="
set "HTTP_PROXY="
set "http_proxy="
set "HTTPS_PROXY="
set "https_proxy="
set "NO_PROXY=*"
set "no_proxy=*"

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

:: ====== 1. Parar lo que este corriendo ======
echo.
echo [1/5] Parando servicios...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING" 2^>nul') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3003 " ^| findstr "LISTENING" 2^>nul') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3004 " ^| findstr "LISTENING" 2^>nul') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5005 " ^| findstr "LISTENING" 2^>nul') do taskkill /PID %%a /F >nul 2>&1
echo       OK
echo.

:: ====== 2. Dependencias de Node ======
:: Se ejecuta siempre, aunque exista node_modules: una instalacion a medias
:: pasaria desapercibida.
echo [2/5] Dependencias del bot (puede tardar)...
call npm install --no-audit --no-fund
if errorlevel 1 goto :error_node

echo       - servicio IQ Option...
cd /d "%~dp0mini-services\iqoption-service"
call npm install --no-audit --no-fund
if errorlevel 1 goto :error_node

echo       - auto-trader...
cd /d "%~dp0mini-services\autotrader-service"
call npm install --no-audit --no-fund
if errorlevel 1 goto :error_node

cd /d "%~dp0"
echo       OK
echo.

:: ====== 3. Base de datos ======
:: Con `npm run` se usa el prisma LOCAL. Con `npx prisma` se lo puede descargar
:: y pregunta "Ok to proceed?", que en una ventana minimizada nadie ve.
echo [3/5] Base de datos...
call npm run db:generate
if errorlevel 1 goto :error_bd
call npm run db:push
if errorlevel 1 goto :error_bd
echo       OK - prisma\db\custom.db
echo.

:: ====== 4. Librerias de Python ======
echo [4/5] Librerias de Python...
python --version >nul 2>&1
if errorlevel 1 goto :error_py_falta

:: PySocks primero: si mas adelante hace falta un proxy SOCKS, ya estara.
python -m pip install --quiet --disable-pip-version-check pysocks >nul 2>&1

:: OJO: websocket-client NO se actualiza, a proposito.
:: iqoptionapi esta escrita para la 0.56 (su setup.py la fija asi). En la 1.x
:: cambiaron como se llaman los callbacks del websocket y la libreria revienta
:: justo al iniciar sesion.
echo       - requests, flask...
python -m pip install --disable-pip-version-check --upgrade requests flask flask-cors
if errorlevel 1 goto :error_pip

echo       - iqoptionapi (desde GitHub)...
python -m pip install --disable-pip-version-check --upgrade --force-reinstall --no-deps https://github.com/iqoptionapi/iqoptionapi/archive/refs/heads/master.zip
if errorlevel 1 goto :error_pip

echo       - websocket-client 0.56 (version exacta que necesita)...
python -m pip install --disable-pip-version-check "websocket-client==0.56"
if errorlevel 1 goto :error_pip

python -c "from iqoptionapi.stable_api import IQ_Option" >nul 2>&1
if errorlevel 1 goto :error_py

python -c "import websocket,sys; sys.exit(0 if websocket.__version__.startswith('0.5') else 1)" >nul 2>&1
if errorlevel 1 goto :error_ws

echo       OK
echo.

:: ====== 5. Comprobacion final ======
echo [5/5] Comprobando...
set PROBLEMAS=0
if not exist "node_modules" set PROBLEMAS=1
if not exist "mini-services\iqoption-service\node_modules\.bin\tsx.cmd" set PROBLEMAS=1
if not exist "mini-services\autotrader-service\node_modules\.bin\tsx.cmd" set PROBLEMAS=1
if not exist "prisma\db\custom.db" set PROBLEMAS=1
python -c "from iqoptionapi.stable_api import IQ_Option" >nul 2>&1
if errorlevel 1 set PROBLEMAS=1
python -c "import websocket,sys; sys.exit(0 if websocket.__version__.startswith('0.5') else 1)" >nul 2>&1
if errorlevel 1 set PROBLEMAS=1

echo.
echo ============================================================
if "%PROBLEMAS%"=="0" (
    echo   TODO LISTO
    echo.
    echo   Ahora haz doble clic en:  arrancar.bat
) else (
    echo   Quedan cosas sin resolver.
    echo   Ejecuta diagnostico.bat para ver cual.
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
echo Haz una foto de esta ventana para ver que dice exactamente.
echo.
pause
exit /b 1

:error_pip
echo.
echo [ERROR] pip no pudo descargar las librerias.
echo.
echo Si el error dice "Missing dependencies for SOCKS support" o menciona un
echo proxy, es por un VPN o proxy activo en el sistema:
echo.
echo   1. Cierra el programa de VPN / proxy
echo   2. Vuelve a ejecutar reparar.bat
echo.
echo Si el error habla de conexion o de SSL, revisa tu internet.
echo.
pause
exit /b 1

:error_py
echo.
echo [ERROR] Se instalo la libreria pero Python no la puede importar.
echo Cierra todas las ventanas y ejecuta reparar.bat otra vez.
echo.
pause
exit /b 1

:error_ws
echo.
echo [ERROR] No se pudo dejar websocket-client en la version 0.56.
echo.
echo La libreria de IQ Option solo funciona con esa version exacta.
echo Pruebalo a mano en esta misma ventana:
echo   python -m pip install "websocket-client==0.56"
echo.
pause
exit /b 1

:error_py_falta
echo.
echo [ERROR] Python no esta instalado o no esta en el PATH.
echo.
echo Descargalo de https://www.python.org/downloads/ y durante la
echo instalacion MARCA la casilla "Add Python to PATH".
echo.
pause
exit /b 1
