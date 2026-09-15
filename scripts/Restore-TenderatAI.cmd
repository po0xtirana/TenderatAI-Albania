@echo off
set "APP_ROOT=C:\ProgramData\TenderatAI"
set /p "BACKUP=Shkruani folderin e backup-it (p.sh. C:\Users\...\backups\20260903-120000): "
if "%BACKUP%"=="" exit /b 1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%APP_ROOT%\Restore-TenderatAI.ps1" -BackupDirectory "%BACKUP%" -EnvFile "%APP_ROOT%\.env.production"
pause
