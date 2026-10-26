import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { basename, dirname, extname, join } from "node:path"

import { chromium } from "playwright"

import { browserHome, downloadsDir, ensureBrowserDirs, profileDir } from "./browser-paths.mjs"
import { commandPath } from "./exec.mjs"

export {
  browserHome,
  downloadsDir,
  listRecordings,
  profileDir,
  readRecording,
  recordingPath,
  recordingsDir,
  selectorDbPath,
  writeRecording,
} from "./browser-paths.mjs"

const DEFAULT_VIEWPORT = { width: 1366, height: 900 }
const DEFAULT_TIMEOUT = 30000

function systemCandidates(platform, env) {
  if (platform === "darwin") {
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ]
  }
  if (platform === "win32") {
    const roots = [env.ProgramFiles, env["ProgramFiles(x86)"], env.LOCALAPPDATA].filter(Boolean)
    return roots.flatMap((root) => [
      join(root, "Google", "Chrome", "Application", "chrome.exe"),
      join(root, "Microsoft", "Edge", "Application", "msedge.exe"),
      join(root, "Chromium", "Application", "chrome.exe"),
    ])
  }
  return [
    commandPath("google-chrome-stable"),
    commandPath("google-chrome"),
    commandPath("chromium"),
    commandPath("chromium-browser"),
    commandPath("microsoft-edge"),
  ].filter(Boolean)
}

/** Prefer the system Chrome/Chromium, fall back to Playwright's Chromium. */
export function systemBrowser({
  env = process.env,
  platform = process.platform,
  exists = existsSync,
} = {}) {
  if (env.MLLT_BROWSER_PATH && exists(env.MLLT_BROWSER_PATH)) {
    return { ok: true, path: env.MLLT_BROWSER_PATH, source: "env" }
  }
  for (const path of systemCandidates(platform, env)) {
    if (path && exists(path)) return { ok: true, path, source: "system" }
  }
  return { ok: false, path: "", source: "bundled" }
}

export function launchOptions(env = process.env) {
  const system = systemBrowser({ env })
  if (env.MLLT_BROWSER_CHANNEL) return { channel: env.MLLT_BROWSER_CHANNEL }
  return system.ok ? { executablePath: system.path } : {}
}

export async function launchContext({
  headless = true,
  profile = "default",
  env = process.env,
  timeoutMs = DEFAULT_TIMEOUT,
  args = [],
} = {}) {
  ensureBrowserDirs(env)
  const dir = profileDir(profile, env)
  mkdirSync(dir, { recursive: true })
  const context = await chromium.launchPersistentContext(dir, {
    headless,
    viewport: DEFAULT_VIEWPORT,
    acceptDownloads: true,
    locale: env.MLLT_BROWSER_LOCALE ?? "en-US",
    timeout: timeoutMs,
    ...launchOptions(env),
    args: ["--disable-blink-features=AutomationControlled", "--no-first-run", ...args],
  })
  context.setDefaultTimeout(timeoutMs)
  context.setDefaultNavigationTimeout(timeoutMs)
  await context.addInitScript(() => {
    try {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined })
    } catch {
      // ignore
    }
  })
  return context
}

export async function withContext(options, fn) {
  const context = await launchContext(options)
  try {
    return await fn(context)
  } finally {
    await context.close().catch(() => {})
  }
}

export async function firstPage(context) {
  const pages = context.pages()
  return pages.length ? pages[0] : context.newPage()
}

export async function goTo(
  page,
  url,
  { timeout = DEFAULT_TIMEOUT, waitUntil = "domcontentloaded" } = {},
) {
  await page.goto(url, { waitUntil, timeout })
  return page
}

export function pageKey(url) {
  try {
    return new URL(String(url)).hostname
  } catch {
    return "page"
  }
}

export async function extractPage(page, { selector = "", mode = "text", attr = "" } = {}) {
  if (!selector) {
    const [title, url, text, links] = await Promise.all([
      page.title().catch(() => ""),
      Promise.resolve(page.url()),
      page.evaluate(() => document.body?.innerText ?? "").catch(() => ""),
      page
        .evaluate(() =>
          [...document.querySelectorAll("a[href]")]
            .slice(0, 100)
            .map((link) => ({ text: link.textContent?.trim() ?? "", href: link.href })),
        )
        .catch(() => []),
    ])
    return { title, url, text, links }
  }
  const locator = page.locator(selector)
  const count = await locator.count()
  const values = []
  for (let index = 0; index < Math.min(count, 200); index += 1) {
    const item = locator.nth(index)
    if (mode === "html") values.push(await item.innerHTML())
    else if (mode === "attr" || mode === "href")
      values.push(await item.getAttribute(attr || "href"))
    else values.push((await item.innerText().catch(() => "")) ?? "")
  }
  return { selector, count, values }
}

export async function downloadUrl(context, url, out, env = process.env) {
  const response = await context.request.get(url, { timeout: DEFAULT_TIMEOUT })
  if (!response.ok()) throw new Error(`download failed: HTTP ${response.status()} for ${url}`)
  let target = out
  if (!target) {
    const disposition = response.headers()["content-disposition"] ?? ""
    const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)
    const name = decodeURIComponent(match?.[1] || basename(new URL(url).pathname) || "download")
    target = join(downloadsDir(env), name)
  }
  if (target.endsWith("/") || target.endsWith("\\") || !extname(target)) {
    mkdirSync(target, { recursive: true })
    target = join(target, basename(new URL(url).pathname) || "download")
  }
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, await response.body())
  return target
}

export async function savePage(page, outDir) {
  mkdirSync(outDir, { recursive: true })
  const stem = "page"
  const htmlPath = join(outDir, `${stem}.html`)
  const mhtmlPath = join(outDir, `${stem}.mhtml`)
  const pngPath = join(outDir, `${stem}.png`)
  const textPath = join(outDir, `${stem}.txt`)
  writeFileSync(htmlPath, await page.content(), "utf8")
  writeFileSync(textPath, await page.evaluate(() => document.body?.innerText ?? ""), "utf8")
  await page.screenshot({ path: pngPath, fullPage: true })
  try {
    const cdp = await page.context().newCDPSession(page)
    const snapshot = await cdp.send("Page.captureSnapshot", { format: "mhtml" })
    writeFileSync(mhtmlPath, snapshot.data, "utf8")
  } catch {
    // MHTML is Chromium-only; HTML/text/screenshot are still valid.
  }
  return { html: htmlPath, mhtml: mhtmlPath, png: pngPath, text: textPath }
}

export function browserEnv(env = process.env) {
  return {
    home: browserHome(env),
    profile: profileDir("default", env),
    system: systemBrowser({ env }),
  }
}
