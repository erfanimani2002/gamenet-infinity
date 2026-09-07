@echo off
:: =========================================================
::  نصب خودکار Node.js (نسخه LTS) روی ویندوز - One Click Install
::  فقط کافیست روی این فایل دوبار کلیک کنید.
:: =========================================================

:: بررسی دسترسی ادمین - در صورت نیاز خودش درخواست می‌کند
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo نیاز به دسترسی ادمین است، در حال درخواست مجوز...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo ============================================
echo   نصب خودکار Node.js LTS
echo ============================================
echo.

:: بررسی اینکه آیا Node.js از قبل نصب است
where node >nul 2>&1
if %errorLevel% equ 0 (
    echo Node.js از قبل نصب شده است:
    node -v
    echo.
    echo نصب لغو شد. برای نصب مجدد، ابتدا نسخه فعلی را حذف کنید.
    pause
    exit /b
)

echo در حال دریافت آدرس آخرین نسخه LTS از nodejs.org ...

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ProgressPreference = 'SilentlyContinue';" ^
    "$index = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json';" ^
    "$lts = $index | Where-Object { $_.lts -ne $false } | Select-Object -First 1;" ^
    "$version = $lts.version;" ^
    "$url = \"https://nodejs.org/dist/$version/node-$version-x64.msi\";" ^
    "Write-Host \"در حال دانلود Node.js $version ...\";" ^
    "$out = \"$env:TEMP\\node-installer.msi\";" ^
    "Invoke-WebRequest -Uri $url -OutFile $out;" ^
    "Write-Host 'در حال نصب...';" ^
    "Start-Process msiexec.exe -ArgumentList \"/i `\"$out`\" /qn /norestart\" -Wait;" ^
    "Remove-Item $out -Force;" ^
    "Write-Host 'نصب کامل شد.'"

echo.
echo در حال بروزرسانی PATH ...

:: بارگذاری مجدد PATH در همین session
for /f "tokens=2*" %%a in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path') do set "SYS_PATH=%%b"
for /f "tokens=2*" %%a in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USER_PATH=%%b"
set "PATH=%SYS_PATH%;%USER_PATH%"

echo.
echo ============================================
echo   بررسی نصب
echo ============================================
node -v
npm -v

echo.
echo ✅ نصب با موفقیت انجام شد.
echo (اگر دستور node شناخته نشد، یک بار ترمینال/کامپیوتر را ری‌استارت کنید)
echo.
pause
