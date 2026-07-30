@echo off
cd /d "%~dp0"
set "NODE_EXE=C:\Program Files\nodejs\node.exe"

if not exist "%NODE_EXE%" (
  echo Cannot find Node.js at:
  echo %NODE_EXE%
  echo.
  echo Please install Node.js or update NODE_EXE in this file.
  pause
  exit /b 1
)

echo Starting mobile Baccarat AI Assistant...
echo.
echo This window must stay open while using the website.
echo Phone testing:
echo 1. Make sure your phone and this computer are on the same Wi-Fi.
echo 2. Use the Wi-Fi URL shown below by the server.
echo 3. If Windows Firewall asks, allow access on Private networks.
echo.
start "" /min cmd /c "timeout /t 2 >nul & start "" http://localhost:3000"
"%NODE_EXE%" server.js
pause
