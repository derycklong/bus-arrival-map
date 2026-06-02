@echo off
title Bus Arrival Map - Servers

set BACKEND_PORT=8000
set FRONTEND_PORT=3000

echo Stopping existing servers on ports %BACKEND_PORT% and %FRONTEND_PORT%...

for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":%BACKEND_PORT% " ^| findstr LISTENING') do (
    echo Killing backend PID %%P on port %BACKEND_PORT%
    taskkill /F /PID %%P >nul 2>&1
)
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":%FRONTEND_PORT% " ^| findstr LISTENING') do (
    echo Killing frontend PID %%P on port %FRONTEND_PORT%
    taskkill /F /PID %%P >nul 2>&1
)
timeout /t 1 >nul

echo Starting Backend (FastAPI)...
start "Backend" cmd /k "cd /d "%~dp0" && python -m uvicorn backend.main:app --reload --host 0.0.0.0 --port %BACKEND_PORT%"

echo Starting Frontend (Next.js)...
start "Frontend" cmd /k "cd /d "%~dp0web" && npx next dev --hostname 0.0.0.0 --port %FRONTEND_PORT%"

echo.
echo Both servers started!
echo   Backend:  http://127.0.0.1:%BACKEND_PORT%
echo   Frontend: http://localhost:%FRONTEND_PORT%
echo.
echo Close the server windows to stop them.
pause
