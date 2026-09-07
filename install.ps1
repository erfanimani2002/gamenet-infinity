<#
.SYNOPSIS
    نصب‌کننده خودکار پروژه gamenet-infinity برای ویندوز
    مخزن: https://github.com/erfanimani2002/gamenet-infinity

.DESCRIPTION
    1) در صورت نبود Node.js، آن را به‌صورت خودکار دانلود و نصب می‌کند
    2) پروژه را از گیت‌هاب دانلود می‌کند
    3) مسیرهای فایل مطلق (hardcoded) قدیمی را به مسیر نصب جدید اصلاح می‌کند
    4) پروژه را با یک سرور محلی اجرا می‌کند

.USAGE
    اجرا با PowerShell (Run as Administrator توصیه می‌شود):
    powershell -ExecutionPolicy Bypass -File install.ps1
#>

param(
    [string]$InstallDir = "$env:USERPROFILE\gamenet-infinity",
    [int]$Port = 8080
)

$ErrorActionPreference = "Stop"

function Write-Info($msg)  { Write-Host "[+] $msg" -ForegroundColor Cyan }
function Write-Warn($msg)  { Write-Host "[!] $msg" -ForegroundColor Yellow }
function Write-ErrM($msg)  { Write-Host "[x] $msg" -ForegroundColor Red }

$RepoUrl = "https://github.com/erfanimani2002/gamenet-infinity.git"
$RepoZip = "https://github.com/erfanimani2002/gamenet-infinity/archive/refs/heads/main.zip"

###############################################################################
# 1) نصب خودکار Node.js در صورت نبود
###############################################################################
function Test-NodeInstalled {
    try {
        $v = node -v 2>$null
        if ($LASTEXITCODE -eq 0 -and $v) {
            $major = [int]($v.TrimStart('v').Split('.')[0])
            return $major -ge 18
        }
        return $false
    } catch {
        return $false
    }
}

function Install-NodeWindows {
    Write-Info "در حال نصب Node.js (نسخه LTS) ..."

    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Info "نصب با winget ..."
        winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    }
    elseif (Get-Command choco -ErrorAction SilentlyContinue) {
        Write-Info "نصب با Chocolatey ..."
        choco install nodejs-lts -y
    }
    else {
        Write-Warn "نه winget و نه Chocolatey پیدا نشدند؛ دانلود مستقیم نصب‌کننده Node.js ..."
        $installerUrl = "https://nodejs.org/dist/latest-v20.x/node-v20.17.0-x64.msi"
        $installerPath = "$env:TEMP\node-installer.msi"
        Invoke-WebRequest -Uri $installerUrl -OutFile $installerPath
        Start-Process msiexec.exe -ArgumentList "/i `"$installerPath`" /quiet /norestart" -Wait
    }

    # به‌روزرسانی PATH در همین سشن
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

    if (-not (Test-NodeInstalled)) {
        Write-ErrM "نصب خودکار Node.js ناموفق بود. لطفاً از https://nodejs.org دستی نصب کنید و دوباره اجرا کنید."
        exit 1
    }
    Write-Info "Node.js با موفقیت نصب شد: $(node -v)"
}

if (-not (Test-NodeInstalled)) {
    Write-Warn "Node.js نصب نیست یا نسخه آن قدیمی است."
    Install-NodeWindows
} else {
    Write-Info "Node.js از قبل نصب است: $(node -v)"
}

###############################################################################
# 2) دانلود (کلون) مخزن
###############################################################################
if (Test-Path "$InstallDir\.git") {
    Write-Info "مخزن قبلاً در $InstallDir وجود دارد؛ در حال به‌روزرسانی ..."
    git -C $InstallDir pull --ff-only
}
elseif (Get-Command git -ErrorAction SilentlyContinue) {
    Write-Info "در حال دانلود پروژه با git به $InstallDir ..."
    git clone --depth 1 $RepoUrl $InstallDir
}
else {
    Write-Warn "git نصب نیست؛ دانلود با فایل zip انجام می‌شود ..."
    $tmpZip = "$env:TEMP\gamenet-infinity.zip"
    Invoke-WebRequest -Uri $RepoZip -OutFile $tmpZip
    $tmpExtract = "$env:TEMP\gamenet-infinity-extract"
    if (Test-Path $tmpExtract) { Remove-Item $tmpExtract -Recurse -Force }
    Expand-Archive -Path $tmpZip -DestinationPath $tmpExtract
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
    Copy-Item "$tmpExtract\gamenet-infinity-main\*" -Destination $InstallDir -Recurse -Force
}

Set-Location $InstallDir
Write-Info "پروژه در مسیر زیر آماده است: $InstallDir"

###############################################################################
# 3) اصلاح خودکار مسیرهای فایل مطلق (hardcoded)
###############################################################################
Write-Info "در حال بررسی و اصلاح مسیرهای فایل مطلق ..."

$patterns = @(
    'C:\\Users\\[^\\"'']+\\gamenet-infinity',
    '/home/[^/"'']+/gamenet-infinity',
    '/Users/[^/"'']+/gamenet-infinity',
    '[A-Za-z]:\\gamenet-infinity',
    '/var/www/gamenet-infinity',
    '/opt/gamenet-infinity'
)

$targetFiles = Get-ChildItem -Path $InstallDir -Recurse -Include *.html,*.js,*.json,*.css -File |
    Where-Object { $_.FullName -notmatch '\\node_modules\\' -and $_.FullName -notmatch '\\\.git\\' }

$fixedCount = 0
foreach ($file in $targetFiles) {
    $content = Get-Content -Raw -Path $file.FullName
    $original = $content
    foreach ($pattern in $patterns) {
        $content = [regex]::Replace($content, $pattern, [System.Text.RegularExpressions.Regex]::Escape($InstallDir))
    }
    if ($content -ne $original) {
        Set-Content -Path $file.FullName -Value $content -NoNewline
        $fixedCount++
        Write-Info "  مسیر مطلق در فایل زیر اصلاح شد: $($file.FullName.Replace($InstallDir,''))"
    }
}

if ($fixedCount -eq 0) {
    Write-Info "هیچ مسیر مطلق (hardcoded) پیدا نشد؛ پروژه از ابتدا مسیرهای نسبی دارد."
} else {
    Write-Info "$fixedCount فایل اصلاح شد."
}

###############################################################################
# 4) نصب وابستگی‌ها (در صورت وجود package.json)
###############################################################################
if (Test-Path "$InstallDir\package.json") {
    Write-Info "فایل package.json پیدا شد؛ در حال نصب وابستگی‌ها ..."
    npm install
} else {
    Write-Info "فایل package.json در پروژه وجود ندارد (این یک پروژه استاتیک HTML/JS است)."
}

###############################################################################
# 5) اجرای پروژه با یک سرور محلی
###############################################################################
Write-Info "در حال اجرای برنامه با سرور محلی روی پورت $Port ..."
Write-Info "آدرس برنامه: http://localhost:$Port"
Write-Info "برای توقف سرور، کلید Ctrl+C را بزنید."

npx --yes serve -l $Port .
