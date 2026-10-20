@echo off
REM Stops everything run_me.bat started. Safe to run on its own, e.g. if the
REM run_me window was closed, or to clean up after a crash.

set ROOT=%~dp0

echo Stopping Caddy...
docker compose -f "%ROOT%docker.compose.dev.yml" down

echo Closing dev windows...
REM Find the cmd.exe windows run_me.bat started by the AUDIAPTIC_DEV= marker in
REM their command line, then kill each one. /t also kills child processes, so
REM npm's node processes don't linger and keep ports 3000/5173 busy.
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'cmd.exe' -and $_.CommandLine -like '*AUDIAPTIC_DEV=*' } | ForEach-Object { taskkill /pid $_.ProcessId /t /f | Out-Null }"

echo Done.
