# Command execution patterns

Load this reference when the command is not a simple `run_logged "label" cmd args`
call: pipelines, CI, timeouts, expected failures, or deeper log searches. For
Windows, load `windows.md` instead of the POSIX wrapper.

## Pipelines and compound commands

The wrapper records one status for the whole invocation. Put the pipeline inside
a shell that enables `pipefail`:

```bash
run_logged "test" bash -o pipefail -c 'pnpm test 2>&1 | nl -ba'
```

`nl -ba` numbers every line without dropping any, which preserves the full log
and makes later searches easier. Do not use `tee` when its output would reach
the agent; the wrapper already captures the merged stream.

Compound commands need the same shell wrapper so `cd`, `&&`, and `||` run in
the intended directory and context:

```bash
run_logged "release" bash -o pipefail -c 'cd packages/api && pnpm build && pnpm test'
```

Do not let the wrapper change directory in the parent shell. The subshell keeps
the caller's working directory intact.

## Expected nonzero statuses

Some tools use nonzero exits as data, not failure. Decide the contract before
running:

| Command | Nonzero meaning | Treat as |
|---|---|---|
| `grep pattern file` | 1 = no match | Expected when absence is acceptable |
| `diff a b` | 1 = files differ | Expected for comparison-only checks |
| `test -f path` | 1 = condition false | Expected for optional paths |
| `curl --fail` | 22 = HTTP error | Failure |
| `timeout` | 124 = deadline | Failure or retry with a larger limit |

Capture the status deliberately:

```bash
run_logged "lookup" grep -q 'needle' file.txt
status=$?
if [ "$status" -eq 0 ]; then
  echo "found"
elif [ "$status" -eq 1 ]; then
  echo "not found"
else
  echo "grep error: $status"
fi
```

## Timeouts and cancellation

Prefer a bounded run over an agent waiting indefinitely:

```bash
run_logged "install" timeout --signal=TERM --kill-after=10s 20m pnpm install
```

- 124: deadline expired. Report the limit and the last log lines.
- 130: interrupted. Stop and ask before retrying.
- 137: killed, possibly out of memory. Inspect the tail and system logs.

If `timeout` is unavailable, use `gtimeout` on macOS or the platform's process
supervision. Do not silently drop the limit.

## CI and non-interactive runs

CI logs are already captured by the runner, but the agent still needs a local
excerpt. Use a separate log file and avoid terminal-dependent flags:

```bash
CI=1 NO_COLOR=1 run_logged "ci-tests" pnpm test
```

- Disable color and progress spinners when possible; they inflate logs.
- Keep stdin closed for non-interactive commands: `run_logged "job" cmd </dev/null`.
- Never pass secrets as arguments; use the environment or a secret store and
  keep them out of the log.

## PowerShell and cmd.exe

Windows uses different redirection and exit-code APIs. Load
`references/windows.md` for the PowerShell `Run-Logged` wrapper and the
`cmd.exe` pattern; do not reuse the bash `run_logged` function there.

## Deep log inspection

Start with a bounded pattern search, then move to line ranges:

```bash
rg -n -C 3 'error|failed|exception|traceback|fatal' "$log" | head -n 80
rg -n 'test.*(FAIL|failed)' "$log" | head -n 40
sed -n '200,280p' "$log"
```

When the log is JSON lines, extract the failing records instead of printing the
whole file:

```bash
rg -n '"level":"(error|fatal)"' "$log" | head -n 40
```

When multiple logs exist, select the newest explicitly:

```bash
log=$(ls -t "${MLLT_LOG_DIR:-$HOME/.mllt/logs}"/*.log | head -n 1)
```

Do not rely on `ls` parsing for paths with newlines; use `find` with `-print0`
when that risk is real.

## Reporting template

Keep the final report short:

```text
exit=1
log=/home/user/.mllt/logs/20261027T120000Z-1234-tests-4567.log
lines=1240

first 20:
...

last 60:
...

error matches:
src/foo.test.ts:42: expected 1, received 2
```

State the command, exit code, log path, and the smallest useful excerpt. Do not
paste the full log into the agent response.
