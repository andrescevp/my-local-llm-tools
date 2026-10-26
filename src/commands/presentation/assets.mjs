import { copyFileSync, mkdirSync } from "node:fs"
import { createRequire } from "node:module"
import { basename, dirname, extname, join } from "node:path"

const require = createRequire(import.meta.url)

function distDir(pkg) {
  return dirname(require.resolve(pkg))
}

/** Copy reveal.js and Chart.js next to an HTML/PDF output. */
export function copyAssets(outputPath) {
  const outDir = dirname(outputPath)
  const assetName = `${basename(outputPath, extname(outputPath))}-assets`
  const target = join(outDir, assetName)
  const reveal = distDir("reveal.js")
  const chart = distDir("chart.js")
  mkdirSync(join(target, "theme"), { recursive: true })
  copyFileSync(join(reveal, "reveal.css"), join(target, "reveal.css"))
  copyFileSync(join(reveal, "reveal.js"), join(target, "reveal.js"))
  copyFileSync(join(reveal, "theme", "black.css"), join(target, "theme", "black.css"))
  copyFileSync(join(chart, "chart.umd.js"), join(target, "chart.umd.js"))
  return assetName
}
