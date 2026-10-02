@echo off
rem Safety Lab Aero on your own server: double-click this on Windows. It opens the Ubuntu (WSL)
rem window that Docker Desktop already set up and runs install.sh from this folder.
where wsl.exe >nul 2>&1
if errorlevel 1 (
  echo WSL is not installed. Open the Start menu, type cmd, press Enter, type   wsl --install   and press Enter,
  echo restart the computer, then double-click this file again.
  pause
  exit /b 1
)
echo Starting the Safety Lab Aero install in the Ubuntu window...
wsl.exe -e bash -c "cd \"$(wslpath -u '%~dp0')\" && bash install.sh"
echo.
echo Finished. Scroll up for the result. Press any key to close.
pause >nul
