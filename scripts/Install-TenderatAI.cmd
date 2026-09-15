@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-TenderatAI.ps1"
if errorlevel 1 goto failed
echo Instalimi perfundoi. Mund ta mbyllni kete dritare.
pause
exit /b 0
:failed
echo Instalimi deshtoi. Kontrolloni gabimin siper dhe provojeni perseri.
pause
exit /b 1
