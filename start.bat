@echo off
REM ==========================================================================
REM  Jjoltam Ilbo (market mood dashboard) -- double-click to run it on this PC.
REM
REM  ASCII ONLY in this file, on purpose. Korean text inside a .bat breaks when
REM  the console code page does not match, and a broken line can be executed
REM  as a command. The Korean messages are printed by tools\start\launch.mjs
REM  (Node writes UTF-8 correctly once chcp 65001 is set below). When Node
REM  itself is missing, the Korean guide tools\start\HELP-ko.txt opens instead.
REM
REM  Options:  start.bat --rebuild    build again even if nothing changed
REM            start.bat --no-open    do not open the browser
REM ==========================================================================
setlocal
cd /d "%~dp0"
chcp 65001 >nul 2>&1
title Jjoltam Ilbo

where node >nul 2>&1
if errorlevel 1 goto nonode

for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set "NODEMAJOR=%%v"
if %NODEMAJOR% LSS 20 goto oldnode

node "%~dp0tools\start\launch.mjs" %*
set "CODE=%ERRORLEVEL%"
if not "%CODE%"=="0" (
  echo.
  echo [stopped] exit code %CODE% - read the messages above.
  pause
)
exit /b %CODE%

:nonode
echo.
echo [STOP] Node.js is not installed.
echo        Opening the Korean guide and https://nodejs.org/ ...
start "" notepad "%~dp0tools\start\HELP-ko.txt"
start "" https://nodejs.org/
echo.
pause
exit /b 1

:oldnode
echo.
echo [STOP] Node.js v%NODEMAJOR% is too old. v20 or newer is needed.
start "" notepad "%~dp0tools\start\HELP-ko.txt"
start "" https://nodejs.org/
echo.
pause
exit /b 1
