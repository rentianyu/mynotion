@echo off
rem One-click launcher for MyNotion: reuses running services, starts missing ones, opens the browser.
chcp 65001 >nul
cd /d "%~dp0"
title MyNotion
node "%~dp0scripts\launch.mjs" %*
if errorlevel 1 pause
