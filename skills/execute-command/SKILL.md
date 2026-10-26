---
name: execute-command
description: >
  Use this skill whenever you need to run a shell command, build, test,
  install, or long-running process: build a logged wrapper that redirects
  stdout/stderr to a file, prints only bounded head/tail excerpts, preserves
  the original exit code, and searches the log on demand. Trigger on command
  execution with large or noisy output, CI/build failures, and any run whose
  output must be audited without flooding the agent context.
license: MIT
compatibility: opencode, claude, copilot, antigravity
allowed-tools: Bash, Read, Grep
metadata:
  audience: developers
  workflow: command-execution
---

# execute-command

Run commands through a log-first wrapper. The log is the source of truth; the
agent sees a bounded excerpt and can search the rest.

## Contract

1. Redirect stdout and stderr to one log file.
2. Capture `$?` immediately after the command.
3. Print `exit=<code>` and `log=<path>`.
4. Show only `head`/`tail` excerpts; never dump the full log.
5. Return the original exit code.
6. Search the log by pattern only when the excerpt is insufficient.

## Wrapper

The wrapper below is for bash/zsh. On Windows, use the PowerShell wrapper in
`references/windows.md` (also summarized under [Windows](#windows)).

Define this function once per bash/zsh shell session:

```bash
show_log() {
  local log="$1" status="$2" lines head_n tail_n shown
  lines=$(wc -l <"$log" 2>/dev/null || printf 0)
  if [ "$status" -eq 0 ]; then head_n=15; tail_n=30; else head_n=20; tail_n=60; fi
  shown=$((head_n + tail_n))
  if [ "$lines" -le "$shown" ]; then
    sed -n "1,${shown}p" "$log"
    return
  fi
  head -n "$head_n" "$log"
  printf '\n... %d lines omitted ...\n\n' "$((lines - shown))"
  tail -n "$tail_n" "$log"
}

run_logged() {
  local label="${1:-command}" log_dir log status old_umask
  shift
  log_dir="${MLLT_LOG_DIR:-$HOME/.mllt/logs}"
  mkdir -p "$log_dir" || return $?
  old_umask=$(umask)
  umask 077
  label="${label//[^A-Za-z0-9._-]/_}"
  log="$log_dir/$(date -u +%Y%m%dT%H%M%SZ)-$$-${label}-${RANDOM}.log"
  "$@" >"$log" 2>&1
  status=$?
  umask "$old_umask"
  printf 'exit=%d\nlog=%s\n' "$status" "$log"
  show_log "$log" "$status"
  return "$status"
}
```

Usage:

```bash
run_logged "tests" pnpm test
run_logged "build" bash -o pipefail -c 'pnpm build && pnpm pack'
```

`run_logged` passes `"$@"` directly, so spaces and globs are not re-split.
Use `bash -o pipefail -c '…'` when the command contains a pipeline. Do not use
`tee` inside the wrapped command: it can leak output and hide the real status.
For live monitoring, use a separate shell: `tail -f "$log"`.

## Exit codes

| Code | Meaning | Action |
|---:|---|---|
| 0 | Success | Show the bounded success excerpt |
| 1 | General failure or expected no-match (`grep`, `diff`) | Check the command contract before calling it a failure |
| 2 | Usage or configuration error | Fix arguments or config; do not retry unchanged |
| 124 | `timeout` expired | Report the limit; retry only with a larger, justified limit |
| 126 | Command found but not executable | Fix permissions or interpreter |
| 127 | Command not found | Fix PATH or install the dependency |
| 130 | Interrupted (SIGINT) | Stop; do not retry blindly |
| 137 | Killed (SIGKILL, often OOM) | Investigate memory or external kill |

Call `run_logged` as the last command, or assign `status=$?` immediately.
Never run `echo`, `head`, or `tail` between the command and the capture. Do not
wrap the capture in `set -e`. Treat expected nonzero statuses as part of the
command contract: `grep` exits 1 for no match, and `diff` exits 1 for
differences.

## Inspect the log

- Success: first 15 and last 30 lines.
- Failure: first 20 and last 60 lines, plus the exit code.
- Search narrowly and bound the result:

```bash
rg -n -C 2 'error|failed|exception|traceback|fatal' "$log" | head -n 80
grep -n -i -E 'error|failed|exception|traceback|fatal' "$log" | head -n 80
sed -n '120,220p' "$log"
```

- Do not `cat` a log with more than 200 lines.
- An empty log does not prove success; rely on the exit code and the command's
  expected side effects.
- Report the log path so a later step can inspect the full run.

## Long-running commands

Wrap with `timeout`; status 124 is a timeout, not a command failure:

```bash
run_logged "migrate" timeout --signal=TERM --kill-after=10s 30m pnpm migrate
```

If the platform lacks `timeout`, use its equivalent (`gtimeout` on macOS) or
run the command without a wrapper and manage cancellation explicitly.

## Windows

The bash wrapper above is POSIX-only. Git Bash/WSL can use it; native Windows
shells should use PowerShell 7+ (`pwsh`). `references/windows.md` defines
`Run-Logged`/`Show-Log` with `*>` redirection, `$LASTEXITCODE` capture, and
`Select-Object -First/-Last` excerpts. Do not call `head`/`tail` from
PowerShell; they are not native Windows commands.

For a `cmd.exe` batch script, redirect with `>` and `2>&1`, then read
`%ERRORLEVEL%` immediately:

```bat
your-command > "%USERPROFILE%\.mllt\logs\run.log" 2>&1
set "STATUS=%ERRORLEVEL%"
echo exit=%STATUS%
exit /b %STATUS%
```

Use `type` only for a log short enough to read; for larger logs use
`powershell -NoProfile -Command "Get-Content -Tail 60 <log>"` or the PowerShell
wrapper in `references/windows.md`.

## Safety

- Logs can contain secrets. Do not wrap commands that print tokens, passwords,
  `.env` files, or credentials.
- If a sensitive command must be logged, restrict permissions and delete the
  log after inspection; never commit logs.
- Logs live outside the repository under `~/.mllt/logs` by default. Override
  with `MLLT_LOG_DIR` when the project has a dedicated ignored log directory.
- Do not delete or rotate logs automatically; ask before removing artifacts.

## References

- `references/patterns.md` — pipelines, CI, expected nonzero statuses, and deep
  log searches.
- `references/windows.md` — PowerShell wrapper, native exit codes, and
  `Select-Object` excerpts for Windows.

## Validation checklist

- [ ] Both stdout and stderr go to one log file.
- [ ] `$?` is captured immediately and returned unchanged.
- [ ] Output is bounded to the head/tail excerpt unless the log is small.
- [ ] The log path and exit code are reported.
- [ ] Searches are pattern-targeted and capped with `head`.
- [ ] Pipelines use `pipefail`; expected nonzero statuses are documented.
- [ ] Windows runs use PowerShell `$LASTEXITCODE` or `cmd.exe` `%ERRORLEVEL%`.
- [ ] No secrets or credential material are written to the log.
