@echo off
set "APP_ROOT=C:\ProgramData\TenderatAI"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%APP_ROOT%\Backup-TenderatAI.ps1" -EnvFile "%APP_ROOT%\.env.production"
pause
