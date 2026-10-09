# start-all.ps1
# ──────────────
# Single entry point for the ADAM portal — starts everything needed
# (Python inference server, Node backend, Vite frontend) and trains any
# missing prediction models first. Run this instead of starting each
# piece by hand.
#
# Usage (from anywhere):
#   powershell -ExecutionPolicy Bypass -File start-all.ps1
# or just double-click start-all.bat

$ErrorActionPreference = "Stop"

$RootDir    = $PSScriptRoot
$ServerDir  = Join-Path $RootDir "amp-portal\src\server"
$PythonDir  = Join-Path $ServerDir "python"
$AmpDir     = Join-Path $RootDir "amp-portal"
$PythonExe  = "C:\Users\asus\AppData\Local\Python\pythoncore-3.14-64\python.exe"

Write-Host "=== ADAM Portal — starting all services ===" -ForegroundColor Cyan

# ── 1. Train any missing prediction models (one-time, skipped if already trained) ──
$modelsToCheck = @(
    @{ Name = "SVM";  File = Join-Path $PythonDir "svm_model.pkl";  Script = "train_svm.py" },
    @{ Name = "HMM";  File = Join-Path $PythonDir "hmm_model.pkl";  Script = "train_hmm.py" },
    @{ Name = "ESMC"; File = Join-Path $PythonDir "esmc_head.pkl";  Script = "train_esmc.py" },
    @{ Name = "FLM";  File = Join-Path $PythonDir "flm_model";      Script = "train_flm.py" }
)

foreach ($m in $modelsToCheck) {
    if (-not (Test-Path $m.File)) {
        Write-Host "`n[$($m.Name)] model not found — training now (this can take a while)..." -ForegroundColor Yellow
        Push-Location $PythonDir
        & $PythonExe $m.Script
        Pop-Location
    } else {
        Write-Host "[$($m.Name)] model already trained — skipping." -ForegroundColor DarkGray
    }
}

# ── 2. Start the persistent Python inference server ──
Write-Host "`nStarting Python inference server (serve.py) on port 5100..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "cd '$PythonDir'; & '$PythonExe' serve.py"
) -WindowStyle Normal

# ── 3. Start the Node backend ──
Write-Host "Starting Node backend (server.js) on port 5000..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "cd '$ServerDir'; node server.js"
) -WindowStyle Normal

# ── 4. Start the Vite frontend ──
Write-Host "Starting Vite dev server on port 5173..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "cd '$AmpDir'; npm run dev"
) -WindowStyle Normal

Write-Host "`nAll services launching in separate windows. Give it ~15-30s, then open:" -ForegroundColor Green
Write-Host "  http://localhost:5173" -ForegroundColor Green
Write-Host "`nClose each window to stop that service." -ForegroundColor DarkGray
