@echo off
setlocal
title Release-Docs Tool
set "URL=http://127.0.0.1:5175"
set "APP=%~dp0app\server.js"

netstat -ano | findstr /R /C:":5175 .*LISTENING" >nul 2>&1
if not errorlevel 1 goto OPEN

echo [1/3] Starting tool server ...
start "ReleaseDocs" /min cmd /c node "%APP%"
echo [2/3] Waiting for server (up to 12s) ...
set /a tries=0
:WAIT
timeout /t 1 /nobreak >nul
netstat -ano | findstr /R /C:":5175 .*LISTENING" >nul 2>&1
if not errorlevel 1 goto OPEN
set /a tries+=1
if %tries% lss 12 goto WAIT

echo [WARN] Server not ready. Run manually:
echo   node "%~dp0app\server.js"
pause
exit /b 1

:OPEN
echo [2/2] Opening tool UI ...
start "" "%URL%"
timeout /t 2 /nobreak >nul
exit /b 0
