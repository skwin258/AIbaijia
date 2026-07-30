@echo off
cd /d "%~dp0"
echo SK AI backend is starting...
echo.
echo Keep this window open while using the admin dashboard.
echo Admin URL: http://localhost:3000/admin.html
echo Phone URL: http://172.20.10.13:3000/admin.html
echo.
"C:\Program Files\nodejs\node.exe" server.js
echo.
echo Server stopped. If you see this line, copy the error above and send it to Codex.
pause
