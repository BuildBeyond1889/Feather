@echo off
title Feather - autostart on this laptop
set D=%LOCALAPPDATA%\Feather
set S=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set V=%S%\Feather Autostart.vbs
if exist "%S%\Feather Sync.lnk" goto homepc
if exist "%S%\Archie Pocket Sync.lnk" goto homepc
if exist "%S%\Archie Pocket Autostart.vbs" del "%S%\Archie Pocket Autostart.vbs"
if exist "%V%" goto off
if not exist "%D%" mkdir "%D%"
copy /y "%~dp0app\watch.ps1" "%D%\watch.ps1" >nul
> "%V%" echo CreateObject("WScript.Shell").Run "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""%D%\watch.ps1""", 0
start "" wscript "%V%"
echo.
echo   Autostart is ON for this laptop.
echo   From now on, plugging in Feather opens it by itself.
echo   (Run this file again to turn it off.)
echo.
pause
exit /b
:off
del "%V%"
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*\watch.ps1*' -and ($_.CommandLine -like '*Feather*' -or $_.CommandLine -like '*ArchiePocket*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
echo.
echo   Autostart is OFF for this laptop.
echo.
pause
exit /b
:homepc
echo.
echo   This is your home PC: here Feather syncs instead of opening, so autostart isn't needed.
echo.
pause
