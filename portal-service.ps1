# portal-service.ps1
# ───────────────────
# Keeps the ADAM portal running in the background so it does not have to be
# started by hand. Three services, all hidden, all logged to logs\portal\:
#
#     Python inference server   serve.py      port 5100
#     Node backend              server.js     port 5000
#     Vite frontend             vite          port 5173   -> http://localhost:5173
#
# A small watchdog checks each port every 15 seconds and restarts whichever
# service has stopped listening. It runs as your own user (no admin rights),
# starting when you log in to Windows. Windows also re-checks every 5 minutes
# and starts the watchdog again if it has been closed.
#
# Usage (from anywhere):
#     powershell -ExecutionPolicy Bypass -File portal-service.ps1 -Mode install    # start at login, and start now
#     powershell -ExecutionPolicy Bypass -File portal-service.ps1 -Mode status     # what is running
#     powershell -ExecutionPolicy Bypass -File portal-service.ps1 -Mode stop       # stop everything until next login
#     powershell -ExecutionPolicy Bypass -File portal-service.ps1 -Mode uninstall  # stop, and no longer start at login
#
# -Mode run is what the login task executes; it is the watchdog itself.
# start-all.ps1 is unchanged and still works for starting things by hand.
#
# Written for Windows PowerShell 5.1, which is what the login task uses.

param(
    [ValidateSet("run", "install", "uninstall", "status", "stop")]
    [string]$Mode = "status"
)

$ErrorActionPreference = "Stop"

$Root      = $PSScriptRoot
$Amp       = Join-Path $Root "amp-portal"
$ServerDir = Join-Path $Amp "src\server"
$PyDir     = Join-Path $ServerDir "python"
$LogDir    = Join-Path $Root "logs\portal"
$WatchLog  = Join-Path $LogDir "watchdog.log"

$TaskName  = "ADAM Portal"
$MutexName = "Local\ADAMPortalWatchdog"
$Shortcut  = Join-Path ([Environment]::GetFolderPath("Startup")) "ADAM Portal.lnk"
$PSExe     = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
# powershell.exe is a console program: even with -WindowStyle Hidden, Windows
# shows its console for a moment before hiding it. Launched every 5 minutes,
# that was a window popping up out of nowhere - and closing it killed the
# watchdog (exit 0xC000013A). Running it inside a headless console host means
# no window is created at all.
$Conhost   = Join-Path $env:SystemRoot "System32\conhost.exe"

function Resolve-Exe([string]$name, [string]$fallback) {
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $fallback
}

$Python = "C:\Users\asus\AppData\Local\Python\pythoncore-3.14-64\python.exe"   # same as start-all.ps1
$Node   = Resolve-Exe "node.exe" "D:\aplikasi\node.exe"
$Vite   = Join-Path $Amp "node_modules\vite\bin\vite.js"

# Grace: seconds to wait after a start before treating "port not listening" as
# a failure. The Python server loads model weights and the Node backend parses
# 57k spreadsheet rows, so both need longer than Vite.
#
# KeepAlive: never kill a running process just because its port went quiet;
# restart it only once it has exited. The Python server goes silent for over a
# minute while ESMC loads its weights on the first prediction, and restarting
# it then cut that prediction off (and the next one would load again).
# Match: how to recognise an already-running copy started outside this
# watchdog, so a second copy is never started on the same port.
$Services = @(
    @{ Name = "python"; Port = 5100; File = $Python; Args = "-u serve.py";   Dir = $PyDir;     Grace = 240; KeepAlive = $true; Match = "serve\.py" },
    @{ Name = "node";   Port = 5000; File = $Node;   Args = "server.js";     Dir = $ServerDir; Grace = 120 },
    @{ Name = "vite";   Port = 5173; File = $Node;   Args = "`"$Vite`"";     Dir = $Amp;       Grace = 90  }
)

# Consecutive failed checks (15 s apart) before an alive, quiet process is
# restarted. One slow moment is not a crash.
$FailsBeforeRestart = 3

function Write-Log([string]$msg) {
    # Losing a log line is acceptable; losing the watchdog is not. Every step
    # here can throw on a locked file, so the whole thing is best-effort.
    try {
        if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Force $LogDir | Out-Null }
        if ((Test-Path $WatchLog) -and ((Get-Item $WatchLog).Length -gt 2MB)) {
            Move-Item $WatchLog "$WatchLog.prev" -Force
        }
        Add-Content -Path $WatchLog -ErrorAction Stop `
            -Value ("[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg)
    } catch {
        Start-Sleep -Milliseconds 200   # one retry past a transient lock
        try { Add-Content -Path $WatchLog -Value ("[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg) } catch {}
    }
}

function Get-PortOwner([int]$port) {
    $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($c) { return $c.OwningProcess }
    return $null
}

# Get-NetTCPConnection sometimes misses a listener that is plainly up (seen
# after the PC wakes), and the watchdog then kills a healthy service. A real
# connection attempt is the ground truth; ::1 too, since Vite binds there.
function Test-PortListening([int]$port) {
    foreach ($addr in @("127.0.0.1", "::1")) {
        # The family must be the AddressFamily enum, not its name: a bare string
        # matches both TcpClient(AddressFamily) and TcpClient(String hostname),
        # so New-Object threw "ambiguous overloads" before the try could catch
        # it. The probe then reported EVERY port as listening, which stopped the
        # watchdog restarting anything at all.
        $family = if ($addr -match ':') { [System.Net.Sockets.AddressFamily]::InterNetworkV6 }
                  else                   { [System.Net.Sockets.AddressFamily]::InterNetwork }
        $c = $null
        try {
            $c = New-Object System.Net.Sockets.TcpClient -ArgumentList $family
            if ($c.ConnectAsync($addr, $port).Wait(1000) -and $c.Connected) { return $true }
        } catch {
        } finally {
            if ($c) { $c.Close() }
        }
    }
    return $false
}

function Start-PortalService($svc) {
    if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Force $LogDir | Out-Null }
    $out = Join-Path $LogDir "$($svc.Name).log"
    $err = Join-Path $LogDir "$($svc.Name).err"
    # Keep exactly one previous run's output for diagnosing a crash.
    foreach ($f in @($out, $err)) { if (Test-Path $f) { Move-Item $f ($f -replace '\.(log|err)$', '.prev.$1') -Force } }
    return Start-Process -FilePath $svc.File -ArgumentList $svc.Args -WorkingDirectory $svc.Dir `
        -RedirectStandardOutput $out -RedirectStandardError $err -WindowStyle Hidden -PassThru
}

function Test-WatchdogRunning {
    $m = New-Object System.Threading.Mutex($false, $MutexName)
    try {
        if ($m.WaitOne(0)) { $m.ReleaseMutex(); return $false }
        return $true
    } catch [System.Threading.AbandonedMutexException] {
        return $false
    } finally { $m.Dispose() }
}

# ── run: the watchdog ─────────────────────────────────────────────────────────
function Invoke-Watchdog {
    $mutex = New-Object System.Threading.Mutex($false, $MutexName)
    try { $owned = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $owned = $true }
    if (-not $owned) { return }   # another watchdog is already running

    # A stray Ctrl+C reaching this hidden console ended an early test run
    # (exit 0xC000013A). Treat it as ordinary input instead. Harmless if there
    # is no console to configure.
    try { [Console]::TreatControlCAsInput = $true } catch {}

    Write-Log "watchdog started (PID $PID)"
    $state = @{}
    foreach ($s in $Services) { $state[$s.Name] = @{ Proc = $null; Started = [datetime]::MinValue; Starts = @(); Paused = $false; Fails = 0; Quiet = $false } }

    # A supervisor must outlive its own errors. The script-wide "Stop" is right
    # for install and uninstall, where a failure should be loud, but inside this
    # loop any unhandled error would end the process and take the services with
    # it at the next crash.
    $ErrorActionPreference = "Continue"
    $beat = 0

    while ($true) {
      try {
        foreach ($s in $Services) {
            $st = $state[$s.Name]
            if ((Get-PortOwner $s.Port) -or (Test-PortListening $s.Port)) {
                if ($st.Quiet) { Write-Log "$($s.Name): answering again on $($s.Port)"; $st.Quiet = $false }
                $st.Paused = $false; $st.Fails = 0; continue
            }

            $now = Get-Date
            $alive = $st.Proc -and -not $st.Proc.HasExited
            # A copy started outside this watchdog (by hand, or by an earlier
            # watchdog) counts as alive too; starting a second one would only
            # fight it for the port.
            $external = $null
            if (-not $alive -and $s.Match) {
                $external = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
                    Where-Object { $_.CommandLine -match $s.Match } | Select-Object -First 1
            }
            if ($alive -and (($now - $st.Started).TotalSeconds -lt $s.Grace)) { continue }   # still starting up

            if (($alive -or $external) -and $s.KeepAlive) {
                if (-not $st.Quiet) {
                    $procId = if ($alive) { $st.Proc.Id } else { $external.ProcessId }
                    Write-Log "$($s.Name): not answering on $($s.Port) but PID $procId is running (busy, e.g. loading a model) - leaving it alone"
                    $st.Quiet = $true
                }
                continue
            }
            if ($alive) {
                $st.Fails++
                if ($st.Fails -lt $FailsBeforeRestart) { continue }
            }
            $st.Fails = 0

            # Crash-loop guard: five starts inside ten minutes means something is
            # broken (a missing model file, a bad edit). Stop retrying for a while
            # rather than spinning, and say so once in the log.
            $st.Starts = @($st.Starts | Where-Object { ($now - $_).TotalMinutes -lt 10 })
            if ($st.Starts.Count -ge 5) {
                if (-not $st.Paused) { Write-Log "$($s.Name): 5 failed starts in 10 min - pausing restarts; see $($s.Name).err"; $st.Paused = $true }
                continue
            }

            if ($alive) {
                Write-Log "$($s.Name): not listening on $($s.Port) for $FailsBeforeRestart checks in a row - restarting"
                try { Stop-Process -Id $st.Proc.Id -Force } catch {}
            } elseif ($st.Proc) {
                Write-Log "$($s.Name): exited (code $($st.Proc.ExitCode)) - restarting"
            }

            try {
                $st.Proc = Start-PortalService $s
                $st.Started = $now
                $st.Starts += $now
                Write-Log "$($s.Name): started PID $($st.Proc.Id) for port $($s.Port)"
            } catch {
                Write-Log "$($s.Name): could not start - $($_.Exception.Message)"
                $st.Starts += $now
            }
        }

        # A heartbeat every hour, so a loop that has stopped turning is visible
        # in the log instead of looking like a quiet, healthy night.
        $beat++
        if ($beat % 240 -eq 0) { Write-Log "heartbeat - all three ports checked" }
      } catch {
        Write-Log "loop error, continuing - $($_.Exception.Message)"
      }
      Start-Sleep -Seconds 15
    }
}

# ── stop ──────────────────────────────────────────────────────────────────────
function Stop-Portal {
    # The watchdog first, or it would simply restart the services.
    $me = $PID
    Get-CimInstance Win32_Process -Filter "Name='powershell.exe' OR Name='pwsh.exe'" |
        Where-Object { $_.ProcessId -ne $me -and $_.CommandLine -like "*portal-service.ps1*" -and $_.CommandLine -match "-Mode\s+run" } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; "stopped watchdog PID $($_.ProcessId)" }

    foreach ($s in $Services) {
        $owner = Get-PortOwner $s.Port
        if ($owner) {
            Stop-Process -Id $owner -Force -ErrorAction SilentlyContinue
            "stopped $($s.Name) (PID $owner, port $($s.Port))"
        } else {
            "$($s.Name): not running"
        }
    }
}

# ── status ────────────────────────────────────────────────────────────────────
function Show-Status {
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($task)                  { "Start at login : scheduled task '$TaskName' ($($task.State))" }
    elseif (Test-Path $Shortcut) { "Start at login : Startup-folder shortcut" }
    else                        { "Start at login : not installed" }
    "Watchdog       : " + $(if (Test-WatchdogRunning) { "running" } else { "not running" })
    foreach ($s in $Services) {
        # Same two-way check the watchdog uses. Get-NetTCPConnection misses a
        # live listener often enough on this machine that status alone reported
        # DOWN for services that were answering HTTP perfectly well.
        $owner = Get-PortOwner $s.Port
        if ($owner) {
            $p = Get-Process -Id $owner -ErrorAction SilentlyContinue
            "{0,-15}: up    port {1}  PID {2} ({3})" -f $s.Name, $s.Port, $owner, $p.ProcessName
        } elseif (Test-PortListening $s.Port) {
            "{0,-15}: up    port {1}  (answering; PID not reported by Windows)" -f $s.Name, $s.Port
        } else {
            "{0,-15}: DOWN  port {1}" -f $s.Name, $s.Port
        }
    }
    "Website        : http://localhost:5173"
    if (Test-Path $WatchLog) { ""; "Recent watchdog log:"; Get-Content $WatchLog -Tail 6 | ForEach-Object { "  $_" } }
}

# ── install / uninstall ───────────────────────────────────────────────────────
function Install-Portal {
    $arg = "--headless `"$PSExe`" -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Mode run"
    $user = "$env:USERDOMAIN\$env:USERNAME"
    try {
        $action    = New-ScheduledTaskAction -Execute $Conhost -Argument $arg -WorkingDirectory $Root
        # At login, plus a check every 5 minutes. The second trigger is what
        # revives the watchdog if it is ever killed: when it is already running,
        # MultipleInstances IgnoreNew makes the check a no-op.
        $atLogon   = New-ScheduledTaskTrigger -AtLogOn -User $user
        $every5    = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
        $trigger   = @($atLogon, $every5)
        $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
        $settings  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
                        -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -StartWhenAvailable `
                        -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
        Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal `
            -Settings $settings -Description "Keeps the ADAM portal (Python 5100, Node 5000, Vite 5173) running. Managed by $PSCommandPath" `
            -Force | Out-Null
        "Installed scheduled task '$TaskName' (runs at login as $user, no admin rights)."
        Start-ScheduledTask -TaskName $TaskName
        "Started it now."
    } catch {
        # Some machines do not let a standard user register tasks; the Startup
        # folder needs no permission and does the same job at login.
        "Scheduled task not allowed here ($($_.Exception.Message.Trim())) - using the Startup folder instead."
        $ws = New-Object -ComObject WScript.Shell
        $lnk = $ws.CreateShortcut($Shortcut)
        $lnk.TargetPath = $Conhost
        $lnk.Arguments = $arg
        $lnk.WorkingDirectory = $Root
        $lnk.WindowStyle = 7
        $lnk.Description = "Keeps the ADAM portal running"
        $lnk.Save()
        "Created $Shortcut"
        Start-Process -FilePath $Conhost -ArgumentList $arg -WindowStyle Hidden
        "Started it now."
    }
}

function Uninstall-Portal {
    Stop-Portal
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        "Removed scheduled task '$TaskName'."
    }
    if (Test-Path $Shortcut) { Remove-Item $Shortcut -Force; "Removed $Shortcut" }
    "The portal will no longer start at login. Logs are kept in $LogDir."
}

switch ($Mode) {
    "run"       { Invoke-Watchdog }
    "install"   { Install-Portal }
    "uninstall" { Uninstall-Portal }
    "stop"      { Stop-Portal }
    "status"    { Show-Status }
}
