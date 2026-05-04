@echo off
setlocal enabledelayedexpansion

set ROOT=%~dp0
set ROOT=%ROOT:~0,-1%
set CONDA_ENV=health-insights

echo ============================================
echo  Health Insights - Startup
echo ============================================

REM ---------------------------
REM 1. Locate conda base directory
REM ---------------------------
for /f "delims=" %%i in ('conda info --base 2^>nul') do set CONDA_BASE=%%i
if not defined CONDA_BASE (
    echo [ERROR] conda not found. Install Anaconda or Miniconda and ensure it is in PATH.
    pause
    exit /b 1
)
echo [OK] Conda base: %CONDA_BASE%

REM ---------------------------
REM 2. Initialize conda in this shell (fixes "%CONDA_PREFIX% not set" bug)
REM ---------------------------
call "%CONDA_BASE%\Scripts\activate.bat" "%CONDA_BASE%"

REM ---------------------------
REM 3. Create conda env if it does not exist
REM    (uses a for-loop instead of piped findstr which is unreliable)
REM ---------------------------
set ENV_EXISTS=0
for /f "tokens=1" %%E in ('conda env list 2^>nul') do (
    if /i "%%E"=="%CONDA_ENV%" set ENV_EXISTS=1
)

if "%ENV_EXISTS%"=="0" (
    echo Conda environment '%CONDA_ENV%' not found. Creating it...
    conda create -n %CONDA_ENV% python=3.10 -y
    if errorlevel 1 (
        echo [ERROR] Failed to create conda environment.
        pause
        exit /b 1
    )
)

REM ---------------------------
REM 4. Activate env and install Python deps
REM ---------------------------
call conda activate %CONDA_ENV%
echo [OK] Conda env '%CONDA_ENV%' active

if exist "%ROOT%\back-end\requirements.txt" (
    echo Installing/verifying Python dependencies...
    pip install -r "%ROOT%\back-end\requirements.txt" -q
    echo [OK] Python dependencies ready
)

REM ---------------------------
REM 5. MongoDB bootstrap (project-local)
REM ---------------------------
set MONGO_VER=7.0.5
set MONGO_DIR=%ROOT%\mongodb
set MONGO_TGZ=%ROOT%\mongodb.zip

if not exist "%MONGO_DIR%" (
    echo Downloading MongoDB %MONGO_VER%...
    powershell -Command "Invoke-WebRequest -Uri 'https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-%MONGO_VER%.zip' -OutFile '%MONGO_TGZ%'"
    if not exist "%MONGO_TGZ%" (
        echo [ERROR] MongoDB download failed.
        pause
        exit /b 1
    )
    powershell -Command "Expand-Archive -Path '%MONGO_TGZ%' -DestinationPath '%ROOT%' -Force"
    for /d %%F in ("%ROOT%\mongodb-win32-x86_64-windows-%MONGO_VER%") do (
        if exist "%%F" ren "%%F" "mongodb"
    )
    del "%MONGO_TGZ%" 2>nul
)

if not exist "%ROOT%\data" mkdir "%ROOT%\data"
if not exist "%ROOT%\logs" mkdir "%ROOT%\logs"

REM Stop any existing mongod on this port before starting a fresh one
taskkill /f /im mongod.exe >nul 2>&1

start "MongoDB" /min "%MONGO_DIR%\bin\mongod.exe" ^
    --dbpath "%ROOT%\data" ^
    --logpath "%ROOT%\logs\mongod.log" ^
    --bind_ip 127.0.0.1 --port 27017

echo [OK] MongoDB started (data: %ROOT%\data)
timeout /t 2 /nobreak >nul

REM ---------------------------
REM 6. Write temp launcher scripts
REM    (avoids nested-quote breakage when %ROOT% contains spaces)
REM ---------------------------
(
    echo @echo off
    echo title Health Insights - Backend
    echo cd /d "%ROOT%\back-end"
    echo call "%CONDA_BASE%\Scripts\activate.bat" "%CONDA_BASE%"
    echo call conda activate %CONDA_ENV%
    echo echo.
    echo echo  Backend  : http://localhost:8000
    echo echo  API docs : http://localhost:8000/docs
    echo echo.
    echo uvicorn main:app --reload --port 8000
    echo pause
) > "%TEMP%\hi_backend.bat"

(
    echo @echo off
    echo title Health Insights - Frontend
    echo cd /d "%ROOT%\front-end"
    echo if not exist node_modules npm install
    echo echo.
    echo echo  Frontend : http://localhost:5173
    echo echo.
    echo npm run dev
    echo pause
) > "%TEMP%\hi_frontend.bat"

start "Backend"  cmd /k "%TEMP%\hi_backend.bat"
start "Frontend" cmd /k "%TEMP%\hi_frontend.bat"

echo.
echo ============================================
echo  Services starting in separate windows.
echo    Backend  : http://localhost:8000
echo    API docs : http://localhost:8000/docs
echo    Frontend : http://localhost:5173
echo ============================================
echo.
echo Press any key to close this window.
echo ^(Backend and frontend will keep running^)
echo.
pause >nul
