import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

import { chromium } from "playwright"

import { renderHtml } from "./html.mjs"

export async function renderPdf({
  config,
  theme,
  template,
  outputPath,
  pageSize = "A4",
  margin = "20mm",
}) {
  const dir = mkdtempSync(join(tmpdir(), "mllt-presentation-"))
  const htmlPath = join(dir, "deck.html")
  try {
    renderHtml({ config, theme, template: template || "slides", outputPath: htmlPath })
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage()
      await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" })
      await page.pdf({
        path: outputPath,
        format: pageSize,
        margin: { top: margin, bottom: margin, left: margin, right: margin },
        printBackground: true,
        preferCSSPageSize: true,
      })
    } finally {
      await browser.close()
    }
    return outputPath
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
