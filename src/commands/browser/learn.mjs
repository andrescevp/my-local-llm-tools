import { readFileSync } from "node:fs"

import {
  findSelectors,
  listSelectors,
  openBrowserDb,
  removeSelector,
  resetSelectors,
  selectorStats,
  upsertSelector,
} from "../../lib/browser-db.mjs"
import { extractFromHtml, selectorForValue } from "./learn-html.mjs"

function pageKey(value) {
  try {
    return new URL(String(value)).hostname
  } catch {
    return "page"
  }
}

async function sourceHtml({ html = "", url = "", fetchImpl = fetch }) {
  if (html) return { html: readFileSync(html, "utf8"), source: html, url: "" }
  if (!url) throw new Error("--html FILE or --url URL is required")
  const response = await fetchImpl(url, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; my-local-llm-tools)" },
  })
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`)
  return { html: await response.text(), source: url, url }
}

export async function learnAdd({
  html = "",
  url = "",
  value = "",
  selector = "",
  field,
  pageName = "",
  mode = "text",
  attr = "",
  confidence = 0.75,
  env = process.env,
  log = console.log,
  fetchImpl = fetch,
}) {
  if (!field) throw new Error("--field is required")
  const source = await sourceHtml({ html, url, fetchImpl })
  let chosen = selector
  let count = 0
  if (!chosen) {
    if (!value) throw new Error("--value or --selector is required")
    const found = selectorForValue(source.html, value)
    if (!found?.selector) throw new Error(`no element contains value: ${value}`)
    chosen = found.selector
    count = found.count
  } else {
    count = extractFromHtml(source.html, chosen).count
  }
  if (count === 0) throw new Error(`selector matched no elements: ${chosen}`)
  const key = pageName || (source.url ? pageKey(source.url) : "page")
  const { db } = openBrowserDb(env)
  try {
    const row = upsertSelector(db, {
      page: key,
      field,
      selector: chosen,
      extractMode: mode,
      extractAttr: attr || null,
      confidence: Number(confidence),
      source: "taught",
      notes: `learned from ${count} match(es)`,
    })
    log(JSON.stringify({ page: key, field, selector: chosen, count, row }, null, 2))
    return 0
  } finally {
    db.close()
  }
}

export function learnList({
  page = "",
  field = "",
  json = true,
  env = process.env,
  log = console.log,
}) {
  const { db } = openBrowserDb(env)
  try {
    const rows = listSelectors(db, { page, field })
    log(
      json
        ? JSON.stringify(rows, null, 2)
        : rows.map((row) => `${row.page}.${row.field} ${row.selector}`).join("\n"),
    )
    return 0
  } finally {
    db.close()
  }
}

export function learnStats({ env = process.env, log = console.log }) {
  const { db } = openBrowserDb(env)
  try {
    log(JSON.stringify(selectorStats(db), null, 2))
    return 0
  } finally {
    db.close()
  }
}

export function learnRemove({ id, env = process.env, log = console.log }) {
  const { db } = openBrowserDb(env)
  try {
    const ok = removeSelector(db, Number(id))
    log(ok ? `Removed ${id}` : `Not found: ${id}`)
    return ok ? 0 : 1
  } finally {
    db.close()
  }
}

export async function learnTest({
  html = "",
  url = "",
  field,
  pageName = "",
  mode = "text",
  attr = "",
  env = process.env,
  log = console.log,
  fetchImpl = fetch,
}) {
  const source = await sourceHtml({ html, url, fetchImpl })
  const key = pageName || (source.url ? pageKey(source.url) : "page")
  const { db } = openBrowserDb(env)
  try {
    const rows = findSelectors(db, key, field)
    if (!rows.length) throw new Error(`no selector for ${key}.${field}`)
    const row = rows[0]
    const result = extractFromHtml(
      source.html,
      row.selector,
      row.extract_mode || mode,
      row.extract_attr || attr,
    )
    log(JSON.stringify({ page: key, field, selector: row.selector, ...result }, null, 2))
    return result.count > 0 ? 0 : 1
  } finally {
    db.close()
  }
}

export function learnReset({ page = "", yes = false, env = process.env, log = console.log }) {
  if (!yes) throw new Error("learn reset requires --yes")
  const { db } = openBrowserDb(env)
  try {
    const removed = resetSelectors(db, page)
    log(`Removed ${removed} selector(s)`)
    return 0
  } finally {
    db.close()
  }
}
