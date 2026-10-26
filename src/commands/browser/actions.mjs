import { mkdirSync } from "node:fs"
import { dirname, join } from "node:path"

import {
  downloadsDir,
  downloadUrl,
  extractPage,
  firstPage,
  goTo,
  pageKey,
  savePage,
  withContext,
} from "../../lib/browser.mjs"
import { findSelectors, openBrowserDb, recordSelectorOutcome } from "../../lib/browser-db.mjs"

function emit(log, json, value) {
  log(json ? JSON.stringify(value, null, 2) : JSON.stringify(value, null, 2))
}

export async function openPage({
  url,
  headed = false,
  profile = "default",
  env = process.env,
  log = console.log,
}) {
  return withContext({ headless: !headed, profile, env }, async (context) => {
    const page = await firstPage(context)
    await goTo(page, url)
    const summary = await extractPage(page)
    emit(log, true, { url: summary.url, title: summary.title, text: summary.text.slice(0, 2000) })
    return 0
  })
}

export async function extract({
  url,
  selector = "",
  pageName = "",
  field = "",
  mode = "text",
  attr = "",
  json = false,
  profile = "default",
  env = process.env,
  log = console.log,
}) {
  return withContext({ headless: true, profile, env }, async (context) => {
    const page = await firstPage(context)
    await goTo(page, url)
    const key = pageName || pageKey(url)
    if (field) {
      const { db } = openBrowserDb(env)
      try {
        const rows = findSelectors(db, key, field)
        for (const row of rows) {
          const result = await extractPage(page, {
            selector: row.selector,
            mode: row.extract_mode || mode,
            attr: row.extract_attr || attr,
          })
          if (result.count > 0) {
            recordSelectorOutcome(db, row.id, true)
            emit(log, json, { page: key, field, selector: row.selector, ...result })
            return 0
          }
          recordSelectorOutcome(db, row.id, false)
        }
        throw new Error(`no selector matched for ${key}.${field}; run use-my-browser-learn`)
      } finally {
        db.close()
      }
    }
    const result = await extractPage(page, { selector, mode, attr })
    emit(log, json, { page: key, ...result })
    return 0
  })
}

export async function download({
  url,
  out = "",
  selector = "",
  profile = "default",
  env = process.env,
  log = console.log,
}) {
  return withContext({ headless: true, profile, env }, async (context) => {
    if (selector) {
      const page = await firstPage(context)
      await goTo(page, url)
      const pending = page.waitForEvent("download", { timeout: 60000 })
      await page.locator(selector).first().click()
      const item = await pending
      const target = out || join(downloadsDir(env), item.suggestedFilename())
      mkdirSync(dirname(target), { recursive: true })
      await item.saveAs(target)
      log(target)
      return 0
    }
    const target = await downloadUrl(context, url, out, env)
    log(target)
    return 0
  })
}

export async function savePageCommand({
  url,
  out,
  profile = "default",
  env = process.env,
  log = console.log,
}) {
  return withContext({ headless: true, profile, env }, async (context) => {
    const page = await firstPage(context)
    await goTo(page, url, { waitUntil: "networkidle" })
    const saved = await savePage(page, out)
    log(JSON.stringify(saved, null, 2))
    return 0
  })
}
