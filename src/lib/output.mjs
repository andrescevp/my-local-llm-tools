/** Shared output helpers. */

export function humanSize(num) {
  if (!num) return "-"
  let value = Number(num)
  for (const unit of ["B", "KiB", "MiB", "GiB", "TiB"]) {
    if (value < 1024 || unit === "TiB") {
      return unit === "B" ? `${Math.trunc(value)} B` : `${value.toFixed(1)} ${unit}`
    }
    value /= 1024
  }
  return `${value.toFixed(1)} TiB`
}

export function printTable(headers, rows) {
  if (!rows.length) {
    console.log("(none)")
    return
  }
  const cells = rows.map((row) => row.map((cell) => String(cell ?? "")))
  const widths = headers.map((header, column) =>
    Math.max(header.length, ...cells.map((row) => row[column].length)),
  )
  console.log(headers.map((header, index) => header.padEnd(widths[index])).join("  "))
  console.log(widths.map((width) => "-".repeat(width)).join("  "))
  for (const row of cells) {
    console.log(row.map((cell, index) => cell.padEnd(widths[index])).join("  "))
  }
}

export function printModelText(content, thinking) {
  const text = String(content ?? "").trim()
  const thought = String(thinking ?? "").trim()
  if (text) console.log(text)
  else if (thought) console.log(`[thinking]\n${thought}`)
}

export function printJson(value) {
  console.log(JSON.stringify(value, null, 2))
}
