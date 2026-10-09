@echo off
REM Double-click entry point — runs start-all.ps1 with a permissive execution policy
REM (scoped to this process only, doesn't change your system's PowerShell policy).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-all.ps1"
pause
