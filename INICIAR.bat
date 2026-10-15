@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Sistema AutoGas Ica
echo.
echo  SISTEMA AUTOGAS ICA
echo  ------------------------------------------
where node 1>nul 2>nul
if errorlevel 1 (
  echo  Falta Node.js en esta computadora.
  echo  Se abrira la pagina de descarga: instala la version LTS y vuelve a abrir este archivo.
  start "" https://nodejs.org/es
  pause
  exit /b
)
if not exist node_modules\.instalacion-completa (
  echo  Instalando dependencias desde cero. Toma 1 a 3 minutos.
  echo  No cierres esta ventana hasta que se abra el navegador.
  call npm ci --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo  No se pudieron instalar las dependencias. Revisa tu conexion a internet y vuelve a abrir este archivo.
    pause
    exit /b
  )
  echo ok> node_modules\.instalacion-completa
)
echo.
echo  Abriendo el sistema en el navegador...
echo  No cierres esta ventana mientras uses el sistema.
echo.
call npm run dev -- --open
pause
