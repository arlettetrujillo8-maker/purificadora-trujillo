@echo off
setlocal EnableExtensions EnableDelayedExpansion
title Purificadora Trujillo - Servidor local
cd /d "%~dp0"
set "PYTHON_CMD="
python --version >nul 2>nul && set "PYTHON_CMD=python"
if not defined PYTHON_CMD py --version >nul 2>nul && set "PYTHON_CMD=py"
if not defined PYTHON_CMD (
  echo.
  echo PURIFICADORA TRUJILLO
  echo ======================
  echo ERROR: No se encontro Python ni el lanzador py.
  echo Instala Python 3 y activa la opcion "Add Python to PATH".
  echo.
  pause
  exit /b 1
)
set "LOCAL_IP="
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /R /C:"IPv4.*:"') do (
  set "CANDIDATE=%%A"
  set "CANDIDATE=!CANDIDATE: =!"
  if not "!CANDIDATE:~0,4!"=="127." if not defined LOCAL_IP set "LOCAL_IP=!CANDIDATE!"
)
if not defined LOCAL_IP set "LOCAL_IP=IP-DE-TU-COMPUTADORA"
echo.
echo PURIFICADORA TRUJILLO
echo ======================
echo Servidor activo en el puerto 8080.
echo.
echo EN COMPUTADORA:
echo http://localhost:8080
echo.
echo EN CELULAR ^(misma red Wi-Fi^):
echo http://!LOCAL_IP!:8080
echo.
echo Manten esta ventana abierta. Presiona Ctrl+C para detener.
echo.
%PYTHON_CMD% -m http.server 8080 --bind 0.0.0.0
if errorlevel 1 (
  echo.
  echo No se pudo iniciar el servidor. Revisa que el puerto 8080 este disponible.
  pause
)
endlocal
