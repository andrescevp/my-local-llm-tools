import { existsSync, readdirSync, rmSync } from "node:fs"

import {
  browserHome,
  firstPage,
  goTo,
  launchContext,
  profileDir,
  systemBrowser,
} from "../../lib/browser.mjs"

export async function sessionStatus({ profile = "default", json = false, env = process.env } = {}) {
  const dir = profileDir(profile, env)
  const status = {
    profile,
    path: dir,
    exists: existsSync(dir),
    systemBrowser: systemBrowser({ env }),
    files: existsSync(dir) ? readdirSync(dir).length : 0,
  }
  return {
    status,
    output: json ? JSON.stringify(status, null, 2) : `${status.profile} ${status.path}`,
  }
}

export async function sessionLogin({
  profile = "default",
  url = "about:blank",
  timeoutMs = 15 * 60 * 1000,
  env = process.env,
  log = console.log,
} = {}) {
  const context = await launchContext({ headless: false, profile, env, timeoutMs })
  try {
    const page = await firstPage(context)
    await goTo(page, url)
    log(`Browser open (${profile}). Log in or set up the session, then close the window.`)
    log(`Profile: ${profileDir(profile, env)}`)
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, timeoutMs)
      context.on("close", () => {
        clearTimeout(timer)
        resolve()
      })
    })
    return 0
  } finally {
    await context.close().catch(() => {})
  }
}

export async function sessionReset({
  profile = "default",
  yes = false,
  env = process.env,
  log = console.log,
}) {
  if (!yes) throw new Error("session reset requires --yes")
  const dir = profileDir(profile, env)
  rmSync(dir, { recursive: true, force: true })
  log(`Removed ${dir}`)
  return 0
}

export function sessionPath({ env = process.env } = {}) {
  return browserHome(env)
}
