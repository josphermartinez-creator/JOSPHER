@echo off
title Quantum Bot - Instalar IQ Option API
color 0A
cd /d "%~dp0"

echo.
echo ============================================================
echo   INSTALAR IQ OPTION API
echo ============================================================
echo.

:: Quitar variables de proxy que causan el error SOCKS
set "HTTP_PROXY="
set "HTTPS_PROXY="
set "ALL_PROXY="
set "SOCKS_PROXY="
set "http_proxy="
set "https_proxy="
set "all_proxy="

:: Actualizar pip primero (sin proxy)
echo [1/4] Actualizando pip...
python -m pip install --upgrade pip --user --no-cache-dir --quiet --disable-pip-version-check --proxy "" >nul 2>&1
echo       OK
echo.

:: Desinstalar version vieja
echo [2/4] Desinstalando version vieja...
python -m pip uninstall iqoptionapi -y 2>nul
echo       OK
echo.

:: Instalar requests (sin proxy)
echo [3/4] Instalando requests...
python -m pip install --user --no-cache-dir --disable-pip-version-check --proxy "" requests
if errorlevel 1 (
    python -m pip install --no-cache-dir --disable-pip-version-check --proxy "" requests
)
echo.

:: Instalar iqoptionapi desde GitHub (sin proxy)
echo [4/4] Instalando iqoptionapi desde GitHub...
set "IQURL=https://github.com/iqoptionapi/iqoptionapi/archive/refs/heads/master.zip"
python -m pip install -U --user --no-cache-dir --disable-pip-version-check --proxy "" "%IQURL%"
if errorlevel 1 (
    echo       Reintentando sin --user...
    python -m pip install -U --no-cache-dir --disable-pip-version-check --proxy "" "%IQURL%"
)
if errorlevel 1 (
    echo.
    echo  [AVISO] No pude instalar iqoptionapi.
    goto :error
)
echo.

:: Verificar
echo Verificando instalacion...
python -c "from iqoptionapi.stable_api import IQ_Option; print('OK - iqoptionapi instalada correctamente')"
if errorlevel 1 goto :error
echo.

echo ============================================================
echo   INSTALACION COMPLETADA!
echo ============================================================
echo.
echo   Ahora puedes ejecutar: arrancar.bat
echo.
pause
exit /b 0

:error
echo.
echo [ERROR] No se pudo instalar iqoptionapi
echo.
echo SOLUCION MANUAL:
echo   1. Abre CMD
echo   2. Ejecuta: set HTTP_PROXY=
echo   3. Ejecuta: set HTTPS_PROXY=
echo   4. Ejecuta: pip install requests
echo   5. Ejecuta: pip install https://github.com/iqoptionapi/iqoptionapi/archive/refs/heads/master.zip
echo.
pause
exit /b 1
