@echo off
title PERSMA - Sistem Absensi Jurnalistik QR Code
echo ========================================================
echo       SISTEM ABSENSI JURNALISTIK BERBASIS QR CODE
echo               Node.js + Tailwind + MongoDB
echo ========================================================
echo.

set PATH=C:\Users\ahmad\AppData\Local\Programs\nodejs;%PATH%

echo Memeriksa instalasi...
node -v
if errorlevel 1 (
    echo [ERROR] Node.js tidak ditemukan!
    pause
    exit /b
)

echo Membuka server di http://localhost:3000 ...
start http://localhost:3000
node server.js
pause

