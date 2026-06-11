$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

$BUILD_DIR = if ($env:BUILD_DIR) { $env:BUILD_DIR } else { "build" }
$QT_DIR = $env:QT_DIR
$MINGW_DIR = $env:MINGW_DIR
$CMAKE_EXE = if ($env:CMAKE_EXE) { $env:CMAKE_EXE } else { "cmake" }
$CMAKE_GENERATOR = $env:CMAKE_GENERATOR

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  SmartCar - Build" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  WORK: $scriptDir" -ForegroundColor Gray
Write-Host ""

if ($QT_DIR) {
    $qtBin = Join-Path $QT_DIR "bin"
    if (Test-Path $qtBin) {
        $env:PATH = "$qtBin;$env:PATH"
    }
}

if ($MINGW_DIR) {
    $mingwBin = Join-Path $MINGW_DIR "bin"
    if (Test-Path $mingwBin) {
        $env:PATH = "$mingwBin;$env:PATH"
    }
}

if (-not (Test-Path "CMakeLists.txt")) {
    throw "CMakeLists.txt not found. Run this script from software/qt-dashboard."
}

$configureArgs = @(
    "-S", ".",
    "-B", $BUILD_DIR,
    "-DCMAKE_BUILD_TYPE=Release"
)

if ($env:CMAKE_PREFIX_PATH) {
    $configureArgs += "-DCMAKE_PREFIX_PATH=$env:CMAKE_PREFIX_PATH"
} elseif ($QT_DIR) {
    $configureArgs += "-DCMAKE_PREFIX_PATH=$QT_DIR"
}

if ($CMAKE_GENERATOR) {
    $configureArgs += @("-G", $CMAKE_GENERATOR)
}

Write-Host "[1/3] Configure" -ForegroundColor Yellow
& $CMAKE_EXE @configureArgs

Write-Host ""
Write-Host "[2/3] Build" -ForegroundColor Yellow
& $CMAKE_EXE --build $BUILD_DIR --config Release --parallel

Write-Host ""
Write-Host "[3/3] Optional deploy" -ForegroundColor Yellow
$exePath = Get-ChildItem -Path $BUILD_DIR -Recurse -Filter "SmartCar.exe" -File -ErrorAction SilentlyContinue | Select-Object -First 1
$deployTool = if ($QT_DIR) { Join-Path $QT_DIR "bin\windeployqt.exe" } else { $null }

if ($exePath -and $deployTool -and (Test-Path $deployTool)) {
    & $deployTool $exePath.FullName --release --no-translations
    Write-Host "  Deployed Qt runtime beside $($exePath.FullName)" -ForegroundColor Green
} elseif ($exePath) {
    Write-Host "  Build output: $($exePath.FullName)" -ForegroundColor Green
    Write-Host "  Set QT_DIR to enable windeployqt packaging." -ForegroundColor Gray
} else {
    Write-Host "  Build finished. Executable was not found under $BUILD_DIR." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Done." -ForegroundColor Green
