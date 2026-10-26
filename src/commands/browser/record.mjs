import { existsSync, rmSync } from "node:fs"

import {
  firstPage,
  goTo,
  launchContext,
  listRecordings,
  readRecording,
  recordingPath,
  recordingsDir,
  writeRecording,
} from "../../lib/browser.mjs"
import {
  deleteRecordingDb,
  listRecordingsDb,
  openBrowserDb,
  upsertRecording,
} from "../../lib/browser-db.mjs"
import { RECORDER_SCRIPT } from "./selectors-js.mjs"

function validName(name) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(String(name ?? ""))) {
    throw new Error("recording name must be kebab-case")
  }
  return name
}

export async function recordStart({
  name,
  url = "about:blank",
  profile = "default",
  timeoutMs = 15 * 60 * 1000,
  env = process.env,
  log = console.log,
}) {
  validName(name)
  const steps = []
  const add = (step) => {
    const last = steps.at(-1)
    if (
      last?.type === step.type &&
      last?.url === step.url &&
      last?.selector === step.selector &&
      last?.value === step.value
    )
      return
    steps.push(step)
  }
  const context = await launchContext({ headless: false, profile, env, timeoutMs })
  try {
    await context.exposeBinding("__mlltRecord", async (_source, event) => add(event))
    await context.addInitScript(RECORDER_SCRIPT)
    const page = await firstPage(context)
    page.on("framenavigated", (frame) => {
      if (frame !== page.mainFrame()) return
      add({ type: "navigate", selector: "", value: page.url(), url: page.url(), ts: Date.now() })
    })
    if (url !== "about:blank") await goTo(page, url)
    log(
      `Recording "${name}" in ${profileLabel(profile, env)}. Perform actions, then close the window.`,
    )
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, timeoutMs)
      context.on("close", () => {
        clearTimeout(timer)
        resolve()
      })
    })
    const recording = {
      version: 1,
      name,
      createdAt: new Date().toISOString(),
      startUrl: url,
      steps,
    }
    const path = writeRecording(recording, env)
    const { db } = openBrowserDb(env)
    try {
      upsertRecording(db, { name, path, steps: steps.length })
    } finally {
      db.close()
    }
    log(path)
    return 0
  } finally {
    await context.close().catch(() => {})
  }
}

function profileLabel(profile, env) {
  return `${recordingsDir(env)} (profile: ${profile})`
}

export function recordList({ env = process.env, log = console.log }) {
  const files = listRecordings(env)
  const { db } = openBrowserDb(env)
  try {
    const rows = listRecordingsDb(db)
    log(JSON.stringify({ files, rows }, null, 2))
    return 0
  } finally {
    db.close()
  }
}

export function recordShow({ name, env = process.env, log = console.log }) {
  log(JSON.stringify(readRecording(name, env), null, 2))
  return 0
}

export function recordDelete({ name, yes = false, env = process.env, log = console.log }) {
  if (!yes) throw new Error("record delete requires --yes")
  const path = recordingPath(name, env)
  if (existsSync(path)) rmSync(path)
  const { db } = openBrowserDb(env)
  try {
    deleteRecordingDb(db, name)
  } finally {
    db.close()
  }
  log(`Removed ${name}`)
  return 0
}
