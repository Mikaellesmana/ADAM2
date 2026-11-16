# setup_server.ps1 - installs ADAM2 on a Windows server and keeps it running.
# ---------------------------------------------------------------------------
# Run in an ADMINISTRATOR PowerShell, from the cloned repository:
#
#   cd C:\ADAM2
#   powershell -ExecutionPolicy Bypass -File deploy\setup_server.ps1 -Bundle C:\ADAM2_server_bundle
#
# Safe to run again: every step checks first and skips what is already done.
# If a step needs you (install PostgreSQL, reboot after WSL, type a password),
# it stops with instructions; run the same command again afterwards.
#
# What it does
#   1. Node.js 22 and Python 3.14          (winget, if missing)
#   2. Python packages                     (exact versions, CPU PyTorch)
#   3. npm packages + production build     (amp-portal\dist)
#   4. ESMC FLM weights                    (from the bundle)
#   5. Base protein model                  (downloaded once from Hugging Face)
#   6. WSL + foldseek/mmseqs + databases   (from the bundle, into /opt/adam)
#   7. PostgreSQL check                    (database adam_v10)
#   8. .env settings                       (no passwords: you type those)
#   9. Windows Firewall: allow port 5000
#  10. Watchdog: start at login, restart on crash (portal-service.ps1)

param(
    [string]$Bundle = "C:\ADAM2_server_bundle",
    [switch]$SkipPython,
    [switch]$SkipSearchTools
)

$ErrorActionPreference = "Stop"
$Root      = Split-Path $PSScriptRoot -Parent
$Amp       = Join-Path $Root "amp-portal"
$ServerDir = Join-Path $Amp "src\server"
$PyDir     = Join-Path $ServerDir "python"
$EnvFile   = Join-Path $ServerDir ".env"

function Step($n, $text) { Write-Host ""; Write-Host "[$n] $text" -ForegroundColor Cyan }
function Ok($text)       { Write-Host "    OK  $text" -ForegroundColor Green }
function Note($text)     { Write-Host "    ..  $text" }
function Stop-Here($text) {
    Write-Host ""
    Write-Host "    ACTION NEEDED:" -ForegroundColor Yellow
    $text -split "`n" | ForEach-Object { Write-Host "    $_" -ForegroundColor Yellow }
    Write-Host ""
    Write-Host "    Then run this script again." -ForegroundColor Yellow
    exit 1
}
function Refresh-Path {
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
}
function Has-Winget { [bool](Get-Command winget -ErrorAction SilentlyContinue) }

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Stop-Here "Open PowerShell as administrator (right-click Start > Windows PowerShell (Administrator))." }
Write-Host "ADAM2 server setup in $Root" -ForegroundColor White

# -- 1. Node.js and Python ----------------------------------------------------
Step 1 "Node.js and Python"
Refresh-Path
$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $node) {
    if (-not (Has-Winget)) { Stop-Here "Install Node.js 22 LTS from https://nodejs.org (Windows Installer .msi)." }
    Note "installing Node.js 22 LTS..."
    winget install --id OpenJS.NodeJS.22 -e --silent --accept-package-agreements --accept-source-agreements | Out-Host
    Refresh-Path
    $node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
    if (-not $node) { Stop-Here "Node.js was installed but is not on PATH yet. Close this window, open a new administrator PowerShell." }
}
Ok "node $(& $node --version)  ($node)"
$npm = Join-Path (Split-Path $node) "npm.cmd"

function Find-Python {
    foreach ($c in @("$env:LOCALAPPDATA\Programs\Python\Python314\python.exe", "C:\Program Files\Python314\python.exe",
                     "$env:LOCALAPPDATA\Python\pythoncore-3.14-64\python.exe")) { if (Test-Path $c) { return $c } }
    $py = Get-Command py.exe -ErrorAction SilentlyContinue
    if ($py) { try { $p = & py.exe -3.14 -c "import sys;print(sys.executable)" 2>$null; if ($LASTEXITCODE -eq 0 -and $p) { return $p.Trim() } } catch {} }
    return $null
}
$python = Find-Python
if (-not $python) {
    if (-not (Has-Winget)) { Stop-Here "Install Python 3.14 (64-bit) from https://www.python.org/downloads/windows/ and tick 'Add python.exe to PATH'." }
    Note "installing Python 3.14..."
    winget install --id Python.Python.3.14 -e --silent --accept-package-agreements --accept-source-agreements | Out-Host
    Refresh-Path
    $python = Find-Python
    if (-not $python) { Stop-Here "Python 3.14 was installed but not found. Close this window, open a new administrator PowerShell." }
}
Ok "$(& $python --version)  ($python)"

# -- 2. Python packages -------------------------------------------------------
Step 2 "Python packages (exact versions the models were trained with)"
if ($SkipPython) { Note "skipped (-SkipPython)" } else {
    & $python -m pip install --upgrade pip --quiet
    & $python -m pip install --index-url https://download.pytorch.org/whl/cpu torch==2.11.0 --quiet
    if ($LASTEXITCODE -ne 0) { Stop-Here "Installing PyTorch failed (see the message above)." }
    & $python -m pip install -r (Join-Path $PSScriptRoot "requirements-server.txt") --quiet
    if ($LASTEXITCODE -ne 0) { Stop-Here "Installing Python packages failed (see the message above)." }
    Ok "packages installed"
}

# -- 3. npm packages and production build -------------------------------------
Step 3 "Website: npm packages and production build"
Push-Location $Amp;       & $npm ci --no-audit --no-fund | Out-Host; if ($LASTEXITCODE) { Pop-Location; Stop-Here "npm ci failed in amp-portal." }
& $npm run build | Out-Host;                                          if ($LASTEXITCODE) { Pop-Location; Stop-Here "npm run build failed." }
Pop-Location
Push-Location $ServerDir; & $npm ci --no-audit --no-fund | Out-Host; if ($LASTEXITCODE) { Pop-Location; Stop-Here "npm ci failed in src\server." }
Pop-Location
Ok "built $(Join-Path $Amp 'dist')"

# -- 4. ESMC FLM weights ------------------------------------------------------
Step 4 "ESMC FLM model weights"
$weights = Join-Path $PyDir "esmc_flm_model_bal\model_state.pt"
if (Test-Path $weights) { Ok "already in place" } else {
    $src = Join-Path $Bundle "esmc_flm_model_bal\model_state.pt"
    if (-not (Test-Path $src)) { Stop-Here "Copy the ADAM2_server_bundle folder from the development PC to $Bundle`n(it is made there by deploy\make_bundle.ps1), or pass -Bundle <folder>." }
    Copy-Item $src $weights
    Ok "copied from the bundle"
}

# -- 5. Base protein model from Hugging Face ----------------------------------
Step 5 "Base protein model (Synthyra/ESMplusplus_small, ~1.3 GB, downloaded once)"
$prefetch = @"
from transformers import AutoModel, AutoTokenizer
import sys; sys.path.insert(0, r'$PyDir')
from common import ESMC_MODEL_NAME as N, ESMC_MODEL_REVISION as R
AutoTokenizer.from_pretrained(N, revision=R, trust_remote_code=True)
AutoModel.from_pretrained(N, revision=R, trust_remote_code=True)
print('cached', N)
"@
$env:HF_HUB_OFFLINE = "0"; $env:TRANSFORMERS_OFFLINE = "0"
& $python -c $prefetch
if ($LASTEXITCODE -ne 0) { Stop-Here "Downloading the base model failed. Check the internet connection and run again." }
Remove-Item Env:HF_HUB_OFFLINE, Env:TRANSFORMERS_OFFLINE
Ok "base model cached"

# -- 6. WSL with foldseek / mmseqs --------------------------------------------
Step 6 "Sequence and structure search tools (WSL)"
if ($SkipSearchTools) { Note "skipped (-SkipSearchTools): sequence/structure search will not work" } else {
    $distros = (& wsl.exe -l -q 2>$null) -replace "`0", "" | Where-Object { $_.Trim() }
    if (-not $distros) {
        Note "installing WSL with Ubuntu..."
        & wsl.exe --install -d Ubuntu
        Stop-Here "WSL was installed. RESTART the computer.`nAfter the restart an Ubuntu window opens: choose a username and password for Ubuntu (your own choice).`nThen run this script again."
    }
    & wsl.exe -u root -e test -x /opt/adam/mmseqs/bin/mmseqs
    if ($LASTEXITCODE -eq 0) { Ok "already installed in /opt/adam" } else {
        $tar = Join-Path $Bundle "search_tools.tar.gz"
        if (-not (Test-Path $tar)) { Stop-Here "Not found: $tar (copy the bundle from the development PC)." }
        $tarWsl = "/mnt/" + $tar.Substring(0,1).ToLower() + ($tar.Substring(2) -replace '\\','/')
        & wsl.exe -u root -e sh -c "mkdir -p /opt/adam && tar -xzf '$tarWsl' -C /opt/adam && mkdir -p /opt/adam/adam_db/tmp && chmod -R a+rX /opt/adam && chmod 1777 /opt/adam/adam_db/tmp"
        if ($LASTEXITCODE -ne 0) { Stop-Here "Unpacking the search tools into WSL failed." }
        Ok "installed in /opt/adam"
    }
}

# -- 7. PostgreSQL ------------------------------------------------------------
Step 7 "PostgreSQL database"
$pg = Get-Service postgresql* -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $pg) {
    Stop-Here ("PostgreSQL is not installed.`n" +
      "1. Install PostgreSQL 17 from https://www.postgresql.org/download/windows/ (keep port 5432, keep Command Line Tools,`n" +
      "   choose a password for the 'postgres' user and remember it).`n" +
      "2. Double-click $Root\ADAM2_v10\import_v10.bat, type Y, then the password.")
}
if ($pg.Status -ne "Running") { Start-Service $pg.Name }
Ok "$($pg.Name) is running (the site checks database adam_v10 when it starts)"

# -- 8. .env settings ---------------------------------------------------------
Step 8 ".env settings"
if (-not (Test-Path $EnvFile)) { New-Item -ItemType File $EnvFile | Out-Null }
$envText = Get-Content $EnvFile -Raw -ErrorAction SilentlyContinue; if (-not $envText) { $envText = "" }
$add = @()
foreach ($kv in @(@("DATA_SOURCE", "postgres"), @("PGUSER", "postgres"), @("PGPASSWORD", ""), @("SEARCH_TOOLS_DIR", "/opt/adam"))) {
    if ($envText -notmatch "(?m)^\s*$($kv[0])\s*=") { $add += "$($kv[0])=$($kv[1])" }
}
if ($add.Count) {
    if ($envText -and -not $envText.EndsWith("`n")) { Add-Content $EnvFile "" }
    Add-Content $EnvFile ($add -join "`r`n")
    Note "added: $($add -join ', ')"
}
if ((Get-Content $EnvFile -Raw) -match "(?m)^\s*PGPASSWORD\s*=\s*$") {
    Stop-Here ("Open $EnvFile in Notepad and type the PostgreSQL password after PGPASSWORD=`n" +
      "(optional: add GROQ_API_KEY=... and AI_PROVIDER=groq for the AI assistant). Save the file.")
}
Ok ".env has the database settings"
# .env holds the database password and API keys: readable only by this
# account (which runs the website), SYSTEM and Administrators. The website
# never serves it (only amp-portal\dist is public), and Git ignores it.
$me = [Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $EnvFile /inheritance:r /grant:r "${me}:(M)" "*S-1-5-18:(F)" "*S-1-5-32-544:(F)" | Out-Null
if ($LASTEXITCODE -eq 0) { Ok ".env is private (only $me, SYSTEM, Administrators)" } else { Note "could not restrict .env permissions (icacls exit $LASTEXITCODE)" }

# -- 9. Firewall --------------------------------------------------------------
Step 9 "Windows Firewall: allow the website (TCP 5000)"
if (-not (Get-NetFirewallRule -DisplayName "ADAM2 website (TCP 5000)" -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName "ADAM2 website (TCP 5000)" -Direction Inbound -Protocol TCP -LocalPort 5000 -Action Allow -Profile Any | Out-Null
}
Ok "inbound TCP 5000 allowed"

# -- 10. Watchdog -------------------------------------------------------------
Step 10 "Start ADAM2 and keep it running"
@{ python = $python; node = $node; production = $true } | ConvertTo-Json | Set-Content (Join-Path $Root "portal.settings.json") -Encoding UTF8
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root "portal-service.ps1") -Mode stop | Out-Null
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root "portal-service.ps1") -Mode install | Out-Host

Note "waiting for the website on port 5000 (loading 57k entries takes ~1 minute)..."
$up = $false
for ($i = 0; $i -lt 60 -and -not $up; $i++) {
    Start-Sleep -Seconds 5
    try { $up = (Invoke-WebRequest "http://localhost:5000/api/peptides/count" -UseBasicParsing -TimeoutSec 5).StatusCode -eq 200 } catch {}
}
if (-not $up) { Stop-Here "The website did not start. Look at $Root\logs\portal\node.err and node.log." }

$count = (Invoke-RestMethod "http://localhost:5000/api/peptides/count").total
$source = (Get-Content (Join-Path $Root "logs\portal\node.log") -ErrorAction SilentlyContinue | Select-String "Data source" | Select-Object -Last 1)
$lan = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like "192.168.*" -or $_.IPAddress -like "10.*" } | Select-Object -First 1).IPAddress
Write-Host ""
Write-Host "ADAM2 is running." -ForegroundColor Green
Write-Host "  Entries loaded : $count"
Write-Host "  $source"
Write-Host "  On this PC     : http://localhost:5000"
if ($lan) { Write-Host "  In the lab     : http://$($lan):5000" }
Write-Host "  From outside   : after the router forwards port 80 -> $($lan):5000, http://<public IP>"
