@echo off
title SistemaVentaRapida - Apagar

echo Matando procesos node (backend y frontend)...
taskkill /F /IM node.exe >nul 2>&1
if errorlevel 1 (
  echo No habia procesos node corriendo.
) else (
  echo OK: todos los node.exe terminados.
)

echo Borrando cache de Next.js (.next)...
if exist "%~dp0frontend\.next" (
  rmdir /s /q "%~dp0frontend\.next" 2>nul
  if exist "%~dp0frontend\.next" (
    echo AVISO: algunos archivos de .next quedaron lockeados. Reintenta tras unos segundos si hace falta.
  ) else (
    echo OK: .next borrado.
  )
) else (
  echo .next no existia (ya limpio).
)

timeout /t 3 /nobreak >nul
exit /b 0
