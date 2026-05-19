@echo off
py -3 "%~dp0native_host.py" 2>nul
if errorlevel 1 python "%~dp0native_host.py"
