@echo off
title Quantum Bot - Deteniendo...
color 0C

echo.
echo ============================================================
echo   QUANTUM BOT - DETENIENDO SERVICIOS
echo ============================================================
echo.

:: Cerrar ventanas por titulo
echo [1/3] Cerrando ventanas...
taskkill /FI "WINDOWTITLE eq QuantumBot-*" /F >nul 2>&1
echo       OK

:: Liberar puertos
echo [2/3] Liberando puertos...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING" 2^>nul') do (
    taskkill /PID %%a /F >nul 2>&1
    echo       Puerto 3000 liberado
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3003 " ^| findstr "LISTENING" 2^>nul') do (
    taskkill /PID %%a /F >nul 2>&1
    echo       Puerto 3003 liberado
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3004 " ^| findstr "LISTENING" 2^>nul') do (
    taskkill /PID %%a /F >nul 2>&1
    echo       Puerto 3004 liberado
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5005 " ^| findstr "LISTENING" 2^>nul') do (
    taskkill /PID %%a /F >nul 2>&1
    echo       Puerto 5005 liberado
)

:: Matar procesos relacionados
echo [3/3] Deteniendo procesos...
wmic process where "commandline like '%%iqoption_bridge%%'" delete >nul 2>&1
wmic process where "commandline like '%%autotrader%%'" delete >nul 2>&1
wmic process where "commandline like '%%iqoption-service%%'" delete >nul 2>&1

timeout /t 2 /nobreak >nul

echo.
echo ============================================================
echo   TODOS LOS SERVICIOS DETENIDOS
echo ============================================================
echo.
echo Para iniciar de nuevo: arrancar.bat
echo.
pause
