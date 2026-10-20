@echo off
REM Starts the dev environment: API, portal and the Caddy proxy, each in its own window.
REM Then open http://localhost (portal) or ws://localhost/api/performer (socket).

REM %~dp0 is this script's folder, so it works no matter where it's run from.
set ROOT=%~dp0

REM Caddy runs in Docker, so bail early if Docker isn't up.
docker info >nul 2>&1
if errorlevel 1 (
    echo Docker isn't running. Start Docker Desktop and try again.
    pause
    exit /b 1
)

REM Install dependencies on a fresh clone (or if node_modules was deleted).
REM `call` is needed because npm is itself a batch file; without it, this script would stop after npm.
for %%A in (api portal) do (
    if not exist "%ROOT%%%A\node_modules\" (
        echo Installing %%A dependencies...
        pushd "%ROOT%%%A"
        call npm install
        if errorlevel 1 (
            echo npm install failed in %%A.
            popd
            pause
            exit /b 1
        )
        popd
    )
)

REM cmd /k keeps each window open after the process exits, so errors stay visible.
REM `set AUDIAPTIC_DEV=...` does nothing useful by itself; it's a marker in each
REM window's command line so teardown.bat can find these windows. (It can't go by
REM window title: Windows Terminal hides titles from taskkill, and npm/vite
REM overwrite them anyway.) No space before && or the value gets a trailing space.
start "API (port 3000)" cmd /k "set AUDIAPTIC_DEV=api&& cd /d "%ROOT%api" && npm run dev"
start "Portal (port 5173)" cmd /k "set AUDIAPTIC_DEV=portal&& cd /d "%ROOT%portal" && npm run dev -- --host"
start "Caddy (port 80)" cmd /k "set AUDIAPTIC_DEV=caddy&& cd /d "%ROOT%" && docker compose -f docker.compose.dev.yml up"

echo.
echo Dev environment is starting in three windows.
echo   Portal: http://localhost
echo   API:    http://localhost/api/
echo   Socket: ws://localhost/api/performer
echo.
echo Press any key here to shut everything down...
pause >nul
call "%ROOT%teardown.bat"
