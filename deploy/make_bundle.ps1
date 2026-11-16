# make_bundle.ps1 - run on the development PC (not the server).
# ----------------------------------------------------------------
# Collects what the server needs but GitHub does not hold, into one folder:
#
#   ADAM2_server_bundle\
#     esmc_flm_model_bal\model_state.pt   trained ESMC FLM weights (~1.3 GB)
#     search_tools.tar.gz                 foldseek + mmseqs + adam_db from WSL
#
# Copy the whole folder to the server (AnyDesk file transfer or USB), then run
# deploy\setup_server.ps1 there with -Bundle pointing at it.
#
#   powershell -ExecutionPolicy Bypass -File deploy\make_bundle.ps1
#   powershell -ExecutionPolicy Bypass -File deploy\make_bundle.ps1 -Out E:\ADAM2_server_bundle

param(
    [string]$Out = (Join-Path (Split-Path $PSScriptRoot -Parent) "ADAM2_server_bundle"),
    # Where foldseek/, mmseqs/ and adam_db/ live inside WSL on this PC.
    [string]$WslToolsDir = "/home/asus"
)

$ErrorActionPreference = "Stop"
$Root  = Split-Path $PSScriptRoot -Parent
$PyDir = Join-Path $Root "amp-portal\src\server\python"

New-Item -ItemType Directory -Force $Out | Out-Null
Write-Host "Bundle folder: $Out"

# 1. ESMC FLM weights (the model serve.py loads first)
$model = Join-Path $PyDir "esmc_flm_model_bal\model_state.pt"
if (-not (Test-Path $model)) { throw "Not found: $model" }
$dst = Join-Path $Out "esmc_flm_model_bal"
New-Item -ItemType Directory -Force $dst | Out-Null
Write-Host "Copying ESMC FLM weights (~1.3 GB)..."
Copy-Item $model (Join-Path $dst "model_state.pt") -Force

# 2. Search tools and databases from WSL
$tar = Join-Path $Out "search_tools.tar.gz"
$tarWsl = "/mnt/" + $tar.Substring(0,1).ToLower() + ($tar.Substring(2) -replace '\\','/')
Write-Host "Packing foldseek, mmseqs and adam_db from WSL ($WslToolsDir)..."
& wsl.exe -e tar -czf $tarWsl -C $WslToolsDir --exclude=adam_db/tmp foldseek mmseqs adam_db
if ($LASTEXITCODE -ne 0) { throw "tar inside WSL failed (exit $LASTEXITCODE)" }

Write-Host ""
Write-Host "Done. Contents:"
Get-ChildItem $Out -Recurse -File | ForEach-Object { "  {0,10:N0} KB  {1}" -f ($_.Length / 1KB), $_.FullName.Substring($Out.Length + 1) }
Write-Host ""
Write-Host "Copy the folder '$Out' to the server, e.g. to C:\ADAM2_server_bundle"
