@echo off
title Aura Learn
cd /d "%~dp0"

set "PORT=8787"

:: Modo portable: usa node.exe local si existe; si no, usa el node del sistema.
if exist "%~dp0node.exe" (
    set "NODE=%~dp0node.exe"
) else (
    where node >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] No se encontro node.exe ni Node.js instalado en el sistema.
        echo Descarga la version portable completa o instala Node.js 22+ desde https://nodejs.org
        pause
        exit /b 1
    )
    set "NODE=node"
)

if not exist "data" mkdir data

:: Si el puerto ya esta en uso (otra instancia de Aura Learn, o cualquier otra
:: cosa) no la matamos a ciegas: solo abrimos el navegador y salimos, para no
:: arriesgarnos a cerrar un proceso ajeno.
netstat -ano | findstr /r /c:":%PORT% .*LISTENING" >nul
if not errorlevel 1 (
    echo [INFO] El puerto %PORT% ya esta en uso ^(Aura Learn ya esta corriendo?^).
    start "" "http://localhost:%PORT%"
    pause
    exit /b 0
)

echo.
echo  =========================================
echo   Aura Learn
echo  =========================================
echo   http://localhost:%PORT%
echo   Cierra esta ventana para detener.
echo  =========================================
echo.

start "" "http://localhost:%PORT%"
"%NODE%" --experimental-sqlite --disable-warning=ExperimentalWarning server/index.js

pause
