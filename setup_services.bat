@echo off
setlocal enabledelayedexpansion

set ROOT=%~dp0
set ROOT=%ROOT:~0,-1%

echo ============================================
echo  Health Insights - Services Setup
echo ============================================

REM ---------------------------
REM 1. Pull Docker images
REM ---------------------------
echo.
echo [1/4] Pulling Docker images...

docker pull hapiproject/hapi:latest
if errorlevel 1 (
    echo [ERROR] Failed to pull HAPI FHIR image. Is Docker running?
    pause
    exit /b 1
)

docker pull binwiederhier/ntfy:latest
if errorlevel 1 (
    echo [ERROR] Failed to pull ntfy image.
    pause
    exit /b 1
)

echo [OK] Images pulled.

REM ---------------------------
REM 2. Stop and remove any existing containers with the same names
REM ---------------------------
echo.
echo [2/4] Starting containers...

docker rm -f hapi-fhir >nul 2>&1
docker rm -f ntfy >nul 2>&1

docker run -d ^
    --name hapi-fhir ^
    -p 8090:8080 ^
    hapiproject/hapi:latest
if errorlevel 1 (
    echo [ERROR] Failed to start HAPI FHIR container.
    pause
    exit /b 1
)

docker run -d ^
    --name ntfy ^
    -p 5050:80 ^
    -v "%ROOT%\ntfydocker:/etc/ntfy" ^
    binwiederhier/ntfy:latest ^
    serve
if errorlevel 1 (
    echo [ERROR] Failed to start ntfy container.
    pause
    exit /b 1
)

echo [OK] Containers started.
echo      HAPI FHIR : http://localhost:8090/fhir
echo      ntfy      : http://localhost:5050

REM ---------------------------
REM 3. Wait for HAPI FHIR to be ready
REM ---------------------------
echo.
echo [3/4] Waiting for HAPI FHIR to come online...

set MAX_WAIT=60
set WAITED=0
set HAPI_READY=0

:wait_loop
timeout /t 3 /nobreak >nul
set /a WAITED+=3

curl -s -o nul -w "%%{http_code}" http://localhost:8090/fhir/metadata > "%TEMP%\hapi_status.txt" 2>nul
set /p HTTP_CODE=<"%TEMP%\hapi_status.txt"
del "%TEMP%\hapi_status.txt" >nul 2>&1

if "%HTTP_CODE%"=="200" (
    set HAPI_READY=1
    goto hapi_online
)

echo    Still waiting... (%WAITED%s elapsed, status: %HTTP_CODE%)

if %WAITED% GEQ %MAX_WAIT% (
    echo [ERROR] HAPI FHIR did not come online within %MAX_WAIT% seconds.
    echo         Check container logs: docker logs hapi-fhir
    pause
    exit /b 1
)

goto wait_loop

:hapi_online
echo [OK] HAPI FHIR is online after %WAITED%s.

REM ---------------------------
REM 4. Upload synthetic patients interactively
REM ---------------------------
echo.
echo [4/4] Uploading synthetic patient data...
echo       Running upload.bat in synthetic-patients\
echo.

cd /d "%ROOT%\synthetic-patients"
call upload.bat

echo.
echo ============================================
echo  Setup complete.
echo    HAPI FHIR : http://localhost:8090/fhir
echo    ntfy      : http://localhost:5050
echo ============================================
echo.
pause
