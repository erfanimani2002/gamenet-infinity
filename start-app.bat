@echo off
cd /d "%~dp0"

tasklist /FI "IMAGENAME eq node.exe" 2>NUL | find /I "node.exe" >NUL
if %ERRORLEVEL% NEQ 0 (
    start "GameNet Server" node server.js
    timeout /t 2 /nobreak >nul
) else (
    echo سرور از قبل در حال اجراست.
)

tasklist /FI "IMAGENAME eq firefox.exe" 2>NUL | find /I "firefox.exe" >NUL
if %ERRORLEVEL% EQU 0 (
    echo فایرفاکس از قبل باز است. تب جدیدی باز نمی‌شود.
    echo اگر تب اپ را بسته‌اید، خودتان آدرس زیر را باز کنید:
    echo http://127.0.0.1:3000
    timeout /t 3 >nul
    exit
)

set FF1=%ProgramFiles%\Mozilla Firefox\firefox.exe
set FF2=%ProgramFiles(x86)%\Mozilla Firefox\firefox.exe

if exist "%FF1%" (
    start "" "%FF1%" http://127.0.0.1:3000
) else if exist "%FF2%" (
    start "" "%FF2%" http://127.0.0.1:3000
) else (
    echo فایرفاکس در مسیر پیش‌فرض پیدا نشد. لطفاً دستی آدرس زیر را در فایرفاکس باز کنید:
    echo http://127.0.0.1:3000
    pause
)
