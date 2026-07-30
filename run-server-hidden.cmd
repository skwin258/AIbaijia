@echo off
cd /d "%~dp0"
"C:\Program Files\nodejs\node.exe" server.js > work\manual-server-out.log 2> work\manual-server-err.log
