import { mkdirSync } from "node:fs"
import { join } from "node:path"

import { downloadsDir, firstPage, goTo, readRecording, withContext } from "../../lib/browser.mjs"

export async function replay({
  name,
  headed = false,
  profile = "default",
  timeoutMs = 60000,
  downloadDir = "",
  env = process.env,
  log = console.log,
}) {
  const recording = readRecording(name, env)
  const targetDir = downloadDir || downloadsDir(env)
  mkdirSync(targetDir, { recursive: true })
  return withContext({ headless: !headed, profile, env, timeoutMs }, async (context) => {
    const page = await firstPage(context)
    const downloads = []
    page.on("download", async (download) => {
      const target = join(targetDir, download.suggestedFilename())
      await download.saveAs(target)
      downloads.push(target)
    })

    for (const [index, step] of recording.steps.entries()) {
      const label = `${index + 1}/${recording.steps.length} ${step.type}`
      try {
        if (step.type === "navigate") {
          const url = step.value || step.url
          if (url && url !== "about:blank") await goTo(page, url, { timeout: timeoutMs })
        } else if (step.type === "click") {
          await page.locator(step.selector).first().click({ timeout: timeoutMs })
        } else if (step.type === "fill") {
          await page
            .locator(step.selector)
            .first()
            .fill(String(step.value ?? ""), {
              timeout: timeoutMs,
            })
        } else if (step.type === "select") {
          await page
            .locator(step.selector)
            .first()
            .selectOption(String(step.value ?? ""), {
              timeout: timeoutMs,
            })
        } else if (step.type === "press") {
          await page
            .locator(step.selector)
            .first()
            .press(String(step.value || "Enter"), {
              timeout: timeoutMs,
            })
        }
        await page.waitForTimeout(200)
      } catch (error) {
        throw new Error(`${label}: ${error.message}`)
      }
    }
    await page.waitForTimeout(500)
    const result = { name, steps: recording.steps.length, downloads }
    log(JSON.stringify(result, null, 2))
    return 0
  })
}
