@echo off
setlocal
title ForgeX AI - Server Launcher
cd /d "%~dp0"
color 0F

:: ==============================================================================
:: PRE-FLIGHT CHECKS
:: ==============================================================================

:: Check if Node.js is installed
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo.
    echo ==============================================================================
    echo  [ERROR] Node.js is not found in your system PATH!
    echo ==============================================================================
    echo  Please install Node.js [v20+ recommended] from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: Ensure root .env exists
if not exist ".env" if exist "infra\env\.env.example" copy "infra\env\.env.example" ".env" >nul
if not exist ".env" if exist ".env.example" copy ".env.example" ".env" >nul

:: Ensure apps\api\.env exists
if not exist "apps\api\.env" if exist ".env" copy ".env" "apps\api\.env" >nul

:: Determine interactive vs direct CLI execution
set "IS_INTERACTIVE=1"
if not "%~1"=="" set "IS_INTERACTIVE=0"

:: ==============================================================================
:: COMMAND LINE ARGUMENT HANDLING
:: ==============================================================================
if not "%~1"=="" (
    if /i "%~1"=="1" goto opt_dev
    if /i "%~1"=="dev" goto opt_dev
    if /i "%~1"=="2" goto opt_full
    if /i "%~1"=="full" goto opt_full
    if /i "%~1"=="3" goto opt_docker_full
    if /i "%~1"=="all" goto opt_docker_full
    if /i "%~1"=="4" goto opt_api
    if /i "%~1"=="api" goto opt_api
    if /i "%~1"=="5" goto opt_web
    if /i "%~1"=="web" goto opt_web
    if /i "%~1"=="6" goto opt_worker
    if /i "%~1"=="worker" goto opt_worker
    if /i "%~1"=="7" goto opt_docker
    if /i "%~1"=="docker" goto opt_docker
    if /i "%~1"=="8" goto opt_stop
    if /i "%~1"=="stop" goto opt_stop
    if /i "%~1"=="9" goto opt_status
    if /i "%~1"=="status" goto opt_status
    if /i "%~1"=="0" goto opt_exit
    if /i "%~1"=="exit" goto opt_exit
    if /i "%~1"=="help" goto opt_help
    if /i "%~1"=="-h" goto opt_help
    if /i "%~1"=="--help" goto opt_help
    echo Unknown option: %~1. Run "start-servers.bat help" for usage.
    exit /b 1
)

:: ==============================================================================
:: MAIN INTERACTIVE MENU
:: ==============================================================================
:menu
cls
echo ==============================================================================
echo                      FORGEX AI - SERVER LAUNCHER
echo ==============================================================================
echo   Working Directory: %CD%
echo ==============================================================================
echo.
echo   [1] Start Dev Servers (API Gateway + Web UI)     [RECOMMENDED]
echo   [2] Start Full Stack  (API + Web UI + Python Worker)
echo   [3] Start Full Stack + Docker Infra (Postgres, Redis, Qdrant, MinIO)
echo   --------------------------------------------------------------------------
echo   [4] Start Core API Gateway Only                  (Port 4000)
echo   [5] Start Web UI Only                            (Port 5173)
echo   [6] Start Python OCR / Extraction Worker Only    (Port 8000)
echo   [7] Start Docker Infrastructure Only             (infra\docker-compose.yml)
echo   --------------------------------------------------------------------------
echo   [8] Stop All Running Servers                     (Frees ports 4000, 5173, 8000)
echo   [9] Check Server Health and Port Status
echo   [0] Exit
echo.
echo ==============================================================================
echo Automatically defaulting to [1] in 8 seconds if no key is pressed...
choice /c 1234567890 /n /t 8 /d 1 /m "Select an option [1-9, 0]: "
set CHOICE_RES=%ERRORLEVEL%

if %CHOICE_RES% equ 1 goto opt_dev
if %CHOICE_RES% equ 2 goto opt_full
if %CHOICE_RES% equ 3 goto opt_docker_full
if %CHOICE_RES% equ 4 goto opt_api
if %CHOICE_RES% equ 5 goto opt_web
if %CHOICE_RES% equ 6 goto opt_worker
if %CHOICE_RES% equ 7 goto opt_docker
if %CHOICE_RES% equ 8 goto opt_stop
if %CHOICE_RES% equ 9 goto opt_status
if %CHOICE_RES% equ 10 goto opt_exit
goto menu

:: ==============================================================================
:: OPTION 1: DEV SERVERS (API + WEB)
:: ==============================================================================
:opt_dev
if "%IS_INTERACTIVE%"=="1" cls
echo ==============================================================================
echo                 STARTING DEV SERVERS (API GATEWAY + WEB UI)
echo ==============================================================================
echo.

call :start_api
call :start_web

echo.
echo ==============================================================================
echo  [SUCCESS] Servers have been launched in separate console windows!
echo.
echo    - Core API Gateway : http://localhost:4000/healthz
echo    - Web UI Workspace : http://localhost:5173
echo.
echo  Closing either terminal window stops that individual service.
echo  To stop all servers at once, run: stop-servers.bat or select option [8].
echo ==============================================================================
echo.
echo Opening Web UI in default browser in 3 seconds...
timeout /t 3 /nobreak >nul 2>&1 || ping -n 4 127.0.0.1 >nul
start http://localhost:5173
echo.
if "%IS_INTERACTIVE%"=="1" (
    echo Press any key to return to menu...
    pause >nul
    goto menu
) else (
    exit /b 0
)

:: ==============================================================================
:: OPTION 2: FULL STACK (API + WEB + WORKER)
:: ==============================================================================
:opt_full
if "%IS_INTERACTIVE%"=="1" cls
echo ==============================================================================
echo          STARTING FULL STACK (API GATEWAY + WEB UI + PYTHON WORKER)
echo ==============================================================================
echo.

call :start_api
call :start_web
call :start_worker

echo.
echo ==============================================================================
echo  [SUCCESS] All 3 application servers launched in separate console windows!
echo.
echo    - Core API Gateway : http://localhost:4000/healthz
echo    - Web UI Workspace : http://localhost:5173
echo    - Python Worker    : http://localhost:8000/healthz
echo ==============================================================================
echo.
echo Opening Web UI in default browser in 3 seconds...
timeout /t 3 /nobreak >nul 2>&1 || ping -n 4 127.0.0.1 >nul
start http://localhost:5173
echo.
if "%IS_INTERACTIVE%"=="1" (
    echo Press any key to return to menu...
    pause >nul
    goto menu
) else (
    exit /b 0
)

:: ==============================================================================
:: OPTION 3: FULL STACK + DOCKER INFRA
:: ==============================================================================
:opt_docker_full
if "%IS_INTERACTIVE%"=="1" cls
echo ==============================================================================
echo       STARTING FULL STACK WITH DOCKER INFRASTRUCTURE CONTAINERS
echo ==============================================================================
echo.

call :start_docker
echo.
echo Starting application servers...
call :start_api
call :start_web
call :start_worker

echo.
echo ==============================================================================
echo  [SUCCESS] Infrastructure and Application servers are running!
echo.
echo    - PostgreSQL       : localhost:5432
echo    - Redis            : localhost:6379
echo    - Qdrant Vector DB : http://localhost:6333
echo    - MinIO S3 Storage : http://localhost:9000 [Console: :9001]
echo    - Ollama LLM       : http://localhost:11434
echo    - Core API Gateway : http://localhost:4000/healthz
echo    - Web UI Workspace : http://localhost:5173
echo    - Python Worker    : http://localhost:8000/healthz
echo ==============================================================================
echo.
echo Opening Web UI in default browser in 3 seconds...
timeout /t 3 /nobreak >nul 2>&1 || ping -n 4 127.0.0.1 >nul
start http://localhost:5173
echo.
if "%IS_INTERACTIVE%"=="1" (
    echo Press any key to return to menu...
    pause >nul
    goto menu
) else (
    exit /b 0
)

:: ==============================================================================
:: OPTION 4: API GATEWAY ONLY
:: ==============================================================================
:opt_api
if "%IS_INTERACTIVE%"=="1" cls
echo ==============================================================================
echo                     STARTING CORE API GATEWAY ONLY
echo ==============================================================================
echo.
call :start_api
echo.
echo  - API Gateway : http://localhost:4000/healthz
echo.
if "%IS_INTERACTIVE%"=="1" (
    echo Press any key to return to menu...
    pause >nul
    goto menu
) else (
    exit /b 0
)

:: ==============================================================================
:: OPTION 5: WEB UI ONLY
:: ==============================================================================
:opt_web
if "%IS_INTERACTIVE%"=="1" cls
echo ==============================================================================
echo                        STARTING WEB UI ONLY
echo ==============================================================================
echo.
call :start_web
echo.
echo  - Web UI : http://localhost:5173
echo.
echo Opening Web UI in default browser in 2 seconds...
timeout /t 2 /nobreak >nul 2>&1 || ping -n 3 127.0.0.1 >nul
start http://localhost:5173
echo.
if "%IS_INTERACTIVE%"=="1" (
    echo Press any key to return to menu...
    pause >nul
    goto menu
) else (
    exit /b 0
)

:: ==============================================================================
:: OPTION 6: PYTHON WORKER ONLY
:: ==============================================================================
:opt_worker
if "%IS_INTERACTIVE%"=="1" cls
echo ==============================================================================
echo                   STARTING PYTHON WORKER ONLY
echo ==============================================================================
echo.
call :start_worker
echo.
echo  - Python Worker : http://localhost:8000/healthz
echo.
if "%IS_INTERACTIVE%"=="1" (
    echo Press any key to return to menu...
    pause >nul
    goto menu
) else (
    exit /b 0
)

:: ==============================================================================
:: OPTION 7: DOCKER INFRASTRUCTURE ONLY
:: ==============================================================================
:opt_docker
if "%IS_INTERACTIVE%"=="1" cls
echo ==============================================================================
echo                   STARTING DOCKER INFRASTRUCTURE
echo ==============================================================================
echo.
call :start_docker
echo.
if "%IS_INTERACTIVE%"=="1" (
    echo Press any key to return to menu...
    pause >nul
    goto menu
) else (
    exit /b 0
)

:: ==============================================================================
:: OPTION 8: STOP ALL SERVERS
:: ==============================================================================
:opt_stop
if "%IS_INTERACTIVE%"=="1" cls
echo ==============================================================================
echo                      STOPPING ALL RUNNING SERVERS
echo ==============================================================================
echo.
call :stop_all_servers
echo.
if "%IS_INTERACTIVE%"=="1" (
    echo Press any key to return to menu...
    pause >nul
    goto menu
) else (
    exit /b 0
)

:: ==============================================================================
:: OPTION 9: HEALTH & STATUS CHECK
:: ==============================================================================
:opt_status
if "%IS_INTERACTIVE%"=="1" cls
echo ==============================================================================
echo                   FORGEX AI - ACTIVE SERVER STATUS CHECK
echo ==============================================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ports = @(4000, 5173, 5174, 8000); Write-Host 'Checking listening ports...' -ForegroundColor Cyan; foreach ($p in $ports) { $conn = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue; if ($conn) { $proc = Get-Process -Id $conn[0].OwningProcess -ErrorAction SilentlyContinue; Write-Host ('  [ONLINE]  Port ' + $p + ' (PID: ' + $conn[0].OwningProcess + ' - ' + $proc.ProcessName + ')') -ForegroundColor Green; } else { Write-Host ('  [OFFLINE] Port ' + $p) -ForegroundColor DarkGray; } }; Write-Host ''; Write-Host 'Checking HTTP Health Endpoints...' -ForegroundColor Cyan; try { $api = Invoke-RestMethod -Uri 'http://localhost:4000/healthz' -TimeoutSec 2 -ErrorAction Stop; Write-Host ('  [OK] API Gateway /healthz: Status = ' + $api.status) -ForegroundColor Green; } catch { Write-Host '  [--] API Gateway /healthz: Unreachable' -ForegroundColor DarkGray; }; try { $worker = Invoke-RestMethod -Uri 'http://localhost:8000/healthz' -TimeoutSec 2 -ErrorAction Stop; Write-Host ('  [OK] Python Worker /healthz: Status = ' + $worker.status) -ForegroundColor Green; } catch { Write-Host '  [--] Python Worker /healthz: Unreachable' -ForegroundColor DarkGray; }; try { $web = Invoke-WebRequest -Uri 'http://localhost:5173' -TimeoutSec 2 -ErrorAction Stop; Write-Host ('  [OK] Web UI http://localhost:5173: HTTP ' + $web.StatusCode) -ForegroundColor Green; } catch { Write-Host '  [--] Web UI http://localhost:5173: Unreachable' -ForegroundColor DarkGray; }"
echo.
echo ==============================================================================
if "%IS_INTERACTIVE%"=="1" (
    echo Press any key to return to menu...
    pause >nul
    goto menu
) else (
    exit /b 0
)

:: ==============================================================================
:: OPTION 0: EXIT
:: ==============================================================================
:opt_exit
echo.
echo Exiting ForgeX AI Server Launcher. Goodbye!
exit /b 0

:: ==============================================================================
:: HELP
:: ==============================================================================
:opt_help
echo ForgeX AI Server Launcher
echo.
echo Usage: start-servers.bat [command]
echo.
echo Commands:
echo   dev       Start API Gateway (4000) and Web UI (5173) [Default]
echo   full      Start API Gateway, Web UI, and Python Worker (8000)
echo   all       Start Docker Infra + API + Web + Worker
echo   api       Start API Gateway only
echo   web       Start Web UI only
echo   worker    Start Python Worker only
echo   docker    Start Docker Compose infrastructure only
echo   stop      Stop all running servers (frees ports 4000, 5173, 8000)
echo   status    Check health and port status of running servers
echo   help      Display this help message
echo.
exit /b 0

:: ==============================================================================
:: HELPER SUBROUTINES
:: ==============================================================================

:start_api
echo [*] Launching ForgeX Core API Gateway on port 4000...
start "ForgeX AI - API Server [Port 4000]" cmd /k "title ForgeX AI - API Server [Port 4000] & color 0B & cd /d "%~dp0" & echo ==================================================== & echo   ForgeX AI - Core API Gateway (Port 4000) & echo ==================================================== & npm run dev:api"
exit /b 0

:start_web
echo [*] Launching ForgeX Web UI Workspace on port 5173...
start "ForgeX AI - Web UI [Port 5173]" cmd /k "title ForgeX AI - Web UI [Port 5173] & color 0A & cd /d "%~dp0" & echo ==================================================== & echo   ForgeX AI - Web UI Workspace (Port 5173) & echo ==================================================== & npm run dev:web"
exit /b 0

:start_worker
echo [*] Launching ForgeX Python Document Worker on port 8000...
where python >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [WARNING] Python was not found in PATH. Skipping Python Worker launch.
    exit /b 1
)
start "ForgeX AI - Python Worker [Port 8000]" cmd /k "title ForgeX AI - Python Worker [Port 8000] & color 0E & cd /d "%~dp0apps\worker" & echo ==================================================== & echo   ForgeX AI - Python Worker (Port 8000) & echo ==================================================== & python main.py"
exit /b 0

:start_docker
echo [*] Checking Docker...
where docker >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [WARNING] Docker is not installed or not in PATH. Skipping Docker Compose.
    exit /b 1
)
echo [*] Launching Docker Compose containers (PostgreSQL, Redis, Qdrant, MinIO, Ollama)...
docker compose -f infra\docker-compose.yml up -d
if %ERRORLEVEL% equ 0 (
    echo [OK] Docker containers started successfully in detached mode.
) else (
    echo [ERROR] Failed to start Docker containers. Make sure Docker Desktop is running!
)
exit /b 0

:stop_all_servers
echo [*] Checking and terminating active processes on ports 4000, 5173, 5174, 8000...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ports = @(4000, 5173, 5174, 8000); $stopped = 0; foreach ($p in $ports) { $conns = Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue; if ($conns) { foreach ($c in $conns) { try { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue; Write-Host ('  [OK] Terminated PID ' + $c.OwningProcess + ' on port ' + $p) -ForegroundColor Yellow; $stopped++; } catch {} } } }; if ($stopped -eq 0) { Write-Host '  [INFO] No active servers found on ports 4000, 5173, 5174, or 8000.' -ForegroundColor Green; } else { Write-Host ('  [SUCCESS] Freed ' + $stopped + ' server process(es).') -ForegroundColor Green; }"
exit /b 0
