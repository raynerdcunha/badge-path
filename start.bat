@echo off
title GitHub Badge Tracker
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Get it from https://nodejs.org and run this again. & pause & exit /b 1)
start "" http://localhost:5173
node run-all.js
pause
