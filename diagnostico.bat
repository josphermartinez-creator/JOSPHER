@echo off
title Quantum Bot - Diagnostico
color 0E
cd /d "%~dp0"

echo.
echo ============================================================
echo   QUANTUM BOT - DIAGNOSTICO
echo ============================================================
echo.
echo Este script verifica que todo este instalado correctamente.
echo.

echo [1] Node.js:
where node 2>nul
if errorlevel 1 (
    echo     NO ENCONTRADO - Instala desde https://nodejs.org/
) else (
    for /f "tokens=*" %%i in ('node --version 2^>nul') do echo     Version: %%i
)
echo.

echo [2] Python:
where python 2>nul
if errorlevel 1 (
    echo     NO ENCONTRADO - Instala desde https://www.python.org/downloads/
) else (
    for /f "tokens=*" %%i in ('python --version 2^>nul') do echo     Version: %%i
)
echo.

echo [3] Bun:
where bun 2>nul
if errorlevel 1 (
    echo     NO ENCONTRADO - Se instalara con instalar.bat
) else (
    for /f "tokens=*" %%i in ('bun --version 2^>nul') do echo     Version: %%i
)
echo.

echo [4] Carpeta del proyecto:
echo     %~dp0
echo.

echo [5] node_modules:
if exist "node_modules" (
    echo     OK - existe
) else (
    echo     NO EXISTE - Ejecuta instalar.bat primero
)
echo.

echo [6] python-bridge:
if exist "python-bridge\iqoption_bridge.py" (
    echo     OK - existe
) else (
    echo     NO EXISTE - Falta el archivo
)
echo.

echo [7] Puertos en uso:
netstat -ano | findstr ":3000 " | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 (echo     Puerto 3000: EN USO) else (echo     Puerto 3000: libre)
netstat -ano | findstr ":3003 " | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 (echo     Puerto 3003: EN USO) else (echo     Puerto 3003: libre)
netstat -ano | findstr ":3004 " | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 (echo     Puerto 3004: EN USO) else (echo     Puerto 3004: libre)
netstat -ano | findstr ":5000 " | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 (echo     Puerto 5000: EN USO) else (echo     Puerto 5000: libre)
echo.

echo ============================================================
echo   FIN DEL DIAGNOSTICO
echo ============================================================
echo.
echo Si algo fallo, revisa los puntos marcados como NO ENCONTRADO.
echo.
echo Presiona cualquier tecla para cerrar...
pause >nul
