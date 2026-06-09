@echo off
setlocal EnableDelayedExpansion
title SistemaVentaRapida - Arranque

REM ============================================================
REM  SistemaVentaRapida - Arrancador one-click
REM
REM  Que hace:
REM    1. Verifica node_modules en backend y frontend (instala si falta)
REM    2. Regenera cliente Prisma (refleja cualquier cambio de schema)
REM    3. Aplica seed de tenants de prueba (idempotente)
REM    4. Abre backend en ventana propia  (puerto 3000)
REM    5. Abre frontend en ventana propia (puerto 3001)
REM
REM  Requisitos previos (que el .bat NO instala):
REM    - Node.js 20+
REM    - PostgreSQL corriendo en localhost:5432 con DB "inventario_db"
REM    - backend\.env con DATABASE_URL apuntando a esa DB
REM ============================================================

cd /d "%~dp0"

echo.
echo ============================================================
echo  SistemaVentaRapida - arrancando...
echo ============================================================
echo.

REM ---------- 1. node_modules backend ----------
if not exist "backend\node_modules" (
  echo [1/5] Instalando dependencias backend (primera vez, puede tardar)...
  pushd backend
  call npm install
  if errorlevel 1 (
    echo ERROR: npm install fallo en backend
    popd
    pause
    exit /b 1
  )
  popd
) else (
  echo [1/5] backend\node_modules OK
)

REM ---------- 2. node_modules frontend ----------
if not exist "frontend\node_modules" (
  echo [2/5] Instalando dependencias frontend (primera vez, puede tardar)...
  pushd frontend
  call npm install
  if errorlevel 1 (
    echo ERROR: npm install fallo en frontend
    popd
    pause
    exit /b 1
  )
  popd
) else (
  echo [2/5] frontend\node_modules OK
)

REM ---------- 3. Prisma generate ----------
echo [3/5] Regenerando cliente Prisma...
pushd backend
call npx prisma generate
if errorlevel 1 (
  echo ERROR: prisma generate fallo. Revisa backend\.env y que Postgres este corriendo.
  popd
  pause
  exit /b 1
)
popd

REM ---------- 4. Seeds (idempotente) ----------
echo [4/5] Aplicando seed de tenants de prueba (idempotente)...
pushd backend
call npx tsx prisma/seed-prueba.ts
if errorlevel 1 (
  echo AVISO: seed fallo. Puede ser que Postgres no este accesible o ya no haya nada nuevo que sembrar.
  echo Continuando con el arranque de todos modos...
)
popd

REM ---------- 5. Arrancar servers en ventanas separadas ----------
echo [5/5] Arrancando backend en ventana nueva (puerto 3000)...
start "SistemaVentaRapida - Backend (puerto 3000)" cmd /k "cd /d %~dp0backend && npm run start:dev"

echo Esperando 4 segundos antes de arrancar frontend...
timeout /t 4 /nobreak >nul

echo Arrancando frontend en ventana nueva (puerto 3001)...
start "SistemaVentaRapida - Frontend (puerto 3001)" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo ============================================================
echo  Listo. Sistema arrancando en dos ventanas separadas.
echo.
echo  URL:        http://localhost:3001/login
echo  Backend:    http://localhost:3000/api/v1
echo.
echo  Credenciales de prueba (seed-prueba.ts):
echo    Email:    admin@bodega-esquina.test
echo    Password: Test1234!
echo.
echo  Otros tenants disponibles (todos misma password):
echo    admin@minimarket-centro.test
echo    admin@mayorista-sur.test
echo    cajero@bodega-esquina.test  (rol operator)
echo.
echo  Para apagar:    cierra las dos ventanas, o ejecuta stop.bat
echo ============================================================
echo.
echo Esta ventana se cerrara sola en 8 segundos. Las ventanas de
echo backend y frontend quedan corriendo aparte.
timeout /t 8 /nobreak >nul
endlocal
exit /b 0
