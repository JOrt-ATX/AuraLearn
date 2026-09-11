@echo off
title Aura Learn - Build Portable
cd /d "%~dp0.."
powershell -ExecutionPolicy Bypass -File scripts\build-portable.ps1
pause
