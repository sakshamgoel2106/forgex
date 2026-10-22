@echo off
setlocal
title ForgeX AI - Stop Servers
cd /d "%~dp0"
color 0C

echo ==============================================================================
echo                      FORGEX AI - STOP ALL SERVERS
echo ==============================================================================
echo.
echo [*] Scanning and freeing ports 4000 (API), 5173/5174 (Web), 8000 (Worker)...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ports = @(4000, 5173, 5174, 8000); $stopped = 0; foreach ($p in $ports) { $conns = Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue; if ($conns) { foreach ($c in $conns) { try { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue; Write-Host ('  [OK] Terminated PID ' + $c.OwningProcess + ' on port ' + $p) -ForegroundColor Yellow; $stopped++; } catch {} } } }; if ($stopped -eq 0) { Write-Host '  [INFO] No active servers found on ports 4000, 5173, 5174, or 8000.' -ForegroundColor Green; } else { Write-Host ('  [SUCCESS] Successfully stopped ' + $stopped + ' server process(es).') -ForegroundColor Green; }"

echo.
if /i "%~1"=="--docker" goto stop_docker
if /i "%~1"=="-d" goto stop_docker
if /i "%~1"=="all" goto stop_docker
if /i "%~1"=="docker" goto stop_docker
goto finish

:stop_docker
where docker >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [*] Stopping Docker Compose containers...
    docker compose -f infra\docker-compose.yml stop
    echo [OK] Docker containers stopped.
)

:finish
echo.
echo ==============================================================================
echo  All ForgeX AI server processes have been stopped.
echo ==============================================================================
echo.
timeout /t 2 /nobreak >nul 2>&1 || ping -n 3 127.0.0.1 >nul
exit /b 0
