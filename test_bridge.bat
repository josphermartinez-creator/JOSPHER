@echo off
title Quantum Bot - Test de Conexion IQ Options
color 0E
cd /d "%~dp0"

echo.
echo ============================================================
echo   TEST DE CONEXION A IQ OPTIONS
echo ============================================================
echo.
echo Este script verifica que iqoptionapi funcione correctamente.
echo.

:: Pedir credenciales
set /p EMAIL="Tu email de IQ Options: "
set /p PASS="Tu password de IQ Options: "

echo.
echo Ejecutando test...
echo.

cd /d "%~dp0python-bridge"
python test_bridge.py "%EMAIL%" "%PASS%"

echo.
echo ============================================================
pause
