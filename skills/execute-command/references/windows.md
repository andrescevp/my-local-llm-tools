# Windows command logging

Use PowerShell 7+ (`pwsh`) on Windows. The POSIX `run_logged` function in the
main skill does not apply: `head` and `tail` are not native Windows commands,
and native exit codes live in `$LASTEXITCODE`.

## PowerShell wrapper

Define both functions in the session, or paste them into a `.ps1` file:

```powershell
function Show-Log {
    param(
        [Parameter(Mandatory)][string]$Path,
        [int]$Status
    )

    $head = if ($Status -eq 0) { 15 } else { 20 }
    $tail = if ($Status -eq 0) { 30 } else { 60 }
    $shown = $head + $tail
    $lineCount = [int]((Get-Content -LiteralPath $Path -ErrorAction SilentlyContinue |
        Measure-Object -Line).Lines)

    if ($lineCount -le $shown) {
        Get-Content -LiteralPath $Path -ErrorAction SilentlyContinue
        return
    }
    Get-Content -LiteralPath $Path -TotalCount $head
    Write-Output "... $($lineCount - $shown) lines omitted ..."
    Get-Content -LiteralPath $Path -Tail $tail
}

function Run-Logged {
    param(
        [string]$Label = "command",
        [Parameter(Mandatory)][scriptblock]$Command
    )

    $logDir = if ($env:MLLT_LOG_DIR) {
        $env:MLLT_LOG_DIR
    } else {
        Join-Path $HOME ".mllt/logs"
    }
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null

    $stamp = Get-Date -Format "yyyyMMddTHHmmssfffZ"
    $safe = if ([string]::IsNullOrWhiteSpace($Label)) {
        "command"
    } else {
        $Label -replace '[^A-Za-z0-9._-]', '_'
    }
    $log = Join-Path $logDir "$stamp-$PID-$safe.log"

    $previousEap = $ErrorActionPreference
    $ErrorActionPreference = "Stop"
    $global:LASTEXITCODE = 0
    $ok = $true
    try {
        & $Command *> $log
        $ok = $?
    } catch {
        $_ | Out-String | Add-Content -LiteralPath $log
        $ok = $false
    } finally {
        $ErrorActionPreference = $previousEap
    }

    $native = $LASTEXITCODE
    $status = if ($native -ne 0) { $native } elseif (-not $ok) { 1 } else { 0 }

    Write-Host "exit=$status"
    Write-Host "log=$log"
    Show-Log -Path $log -Status $status | Write-Host
    return $status
}
```

Usage:

```powershell
$status = Run-Logged "tests" { pnpm test }
if ($status -ne 0) { exit $status }
```

`Run-Logged` returns the status as an integer. `Write-Host` keeps the bounded
excerpt out of the return value, so `$status` stays a number. In an interactive
session, omit `exit` and branch on `$status`.

## Exit-code rules

- Native executables (`.exe`, `pnpm`, `git`, `node`): read `$LASTEXITCODE`
  immediately after the command.
- PowerShell cmdlets: `$?` is `$true`/`$false`; use `-ErrorAction Stop` for
  failure that must terminate and be logged by the `catch` block.
- `exit $status` sets the process exit code in a script; `return $status` only
  returns from a function.
- Do not inspect `$LASTEXITCODE` for a cmdlet-only script without resetting it
  before the run; it may still hold the previous native command's code.
- `Run-Logged` reports the last native exit code plus `$?`. A scriptblock with
  several native commands must fail fast or check each status; a later success
  can overwrite an earlier `$LASTEXITCODE`.
- Common codes match the POSIX table: `0` success, `1` general failure, `2`
  usage, `124` timeout, `126` not executable, `127` not found, `130`
  interrupted, `137` killed.

## cmd.exe

When the command must run under `cmd.exe`, capture `%ERRORLEVEL%` before any
other command and read only the tail of the log:

```bat
set "LOG_DIR=%USERPROFILE%\.mllt\logs"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
set "LOG=%LOG_DIR%\run-%RANDOM%.log"

your-command > "%LOG%" 2>&1
set "STATUS=%ERRORLEVEL%"
echo exit=%STATUS%
echo log=%LOG%
powershell -NoProfile -Command "Get-Content -LiteralPath '%LOG%' -Tail 60"
exit /b %STATUS%
```

`>` writes stdout and `2>&1` merges stderr. Do not use `type "%LOG%"` on a
large log; it defeats the bounded-output rule.

## Search a Windows log

Use `Select-String` and cap the result:

```powershell
Select-String -LiteralPath $log -Pattern "error|failed|exception|traceback" -Context 2,2 |
    Select-Object -First 80
```

For a known line range:

```powershell
Get-Content -LiteralPath $log | Select-Object -Skip 120 -First 100
```

Do not load a multi-GB log into the agent response. Search, select a range, or
use `Get-Content -Tail` and report the log path.
