# Windows examples

The plugin is Node.js and runs natively on Windows. Use **PowerShell** (7 `pwsh`
or Windows PowerShell) for the full examples, or **cmd.exe** for simple
commands. Use WSL2 or Git Bash only when they are installed and configured.

## Check the shells before using them

```powershell
# PowerShell (always present)
Get-Command pwsh, powershell

# cmd.exe (always present)
where cmd

# WSL2: succeeds only when WSL and a distro are configured
wsl --status

# Git Bash: present only if Git for Windows installed it
Get-Command bash
bash --version
```

If `wsl --status` fails, do not use WSL examples. If `bash` is missing, use the
PowerShell or cmd variants below.

## Setup and diagnostics (PowerShell)

```powershell
pnpm install
pnpm cli setup
pnpm cli doctor
pnpm cli doctor --skill ocr --cached
claude plugin validate .
claude --plugin-dir .
```

`setup`, `doctor`, and `pnpm cli` are native Node commands; they do not need
Bash, WSL, or Git Bash.

## CLI examples (PowerShell)

```powershell
pnpm cli skill validate skills/ccreate-skill/SKILL.md
pnpm cli image --image C:\images\shot.png
pnpm cli ocr --image C:\images\page.png
pnpm cli video --input C:\videos\clip.mp4 --frames 12 --summary
pnpm cli speak "Hello, this is the system voice"
pnpm cli voice ensure
```

Paths with spaces must be quoted:

```powershell
pnpm cli image --image "C:\My Images\shot.png"
```

## OpenAI-compatible request (PowerShell)

```powershell
$env:OPENAI_BASE_URL = "http://127.0.0.1:11434/v1"
$env:OPENAI_API_KEY = "ollama"
$body = '{"model":"minicpm-v4.6:latest","messages":[{"role":"user","content":"Hola"}]}'
Invoke-RestMethod -Method Post -Uri "$env:OPENAI_BASE_URL/chat/completions" `
  -Headers @{ Authorization = "Bearer $env:OPENAI_API_KEY" } `
  -ContentType "application/json" -Body $body
```

## OpenAI-compatible request (cmd.exe)

```bat
set OPENAI_BASE_URL=http://127.0.0.1:11434/v1
set OPENAI_API_KEY=ollama
curl.exe -sS "%OPENAI_BASE_URL%/chat/completions" ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer %OPENAI_API_KEY%" ^
  -d "{\"model\":\"minicpm-v4.6:latest\",\"messages\":[{\"role\":\"user\",\"content\":\"Hola\"}]}"
```

Use `curl.exe`, not PowerShell's `curl` alias. In cmd, `^` continues a line.

## Skill paths in commands

From the repository root, `pnpm cli ...` is the simplest form.

On Windows:

- PowerShell: `node "C:\path\to\plugin\src\cli.mjs" ...` (quotes for spaces).
- cmd: `node "C:\path\to\plugin\src\cli.mjs" ...`.

## When to use WSL2 or Git Bash

Use them only when the check above succeeds and the user already works in that
environment. They help with pipes and POSIX paths; they are not required for
`pnpm`, `node`, `setup`, `doctor`, or the CLI.
