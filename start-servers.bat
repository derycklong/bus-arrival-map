@echo off
title Bus Arrival Map - Servers

echo Stopping existing servers...
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM python.exe >nul 2>&1
timeout /t 1 >nul

echo Starting Backend (FastAPI)...
start "Backend" cmd /k "cd /d "%~dp0" && python -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000"

echo Starting Frontend (Next.js)...
start "Frontend" cmd /k "cd /d "%~dp0web" && npx next dev --hostname 0.0.0.0"

echo.
echo Both servers started!
echo   Backend:  http://127.0.0.1:8000
echo   Frontend: http://localhost:3000
echo.
echo Close the server windows to stop them.
pause
