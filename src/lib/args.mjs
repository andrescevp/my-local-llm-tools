/** Minimal non-interactive flag parser. */
export function parseFlags(argv, spec) {
  const values = {}
  const positionals = []
  let index = 0
  let literal = false

  while (index < argv.length) {
    const token = argv[index]
    if (literal || !token.startsWith("-") || token === "-") {
      positionals.push(token)
      index += 1
      continue
    }
    if (token === "--") {
      literal = true
      index += 1
      continue
    }

    const equals = token.indexOf("=")
    const name = equals > 0 ? token.slice(0, equals) : token
    const inline = equals > 0 ? token.slice(equals + 1) : undefined
    const def = spec[name]
    if (!def) throw new Error(`unknown option: ${name}`)

    if (def.type === "boolean") {
      values[def.key] = true
      index += 1
      continue
    }

    let raw = inline
    if (raw === undefined) {
      index += 1
      raw = argv[index]
      if (raw === undefined) throw new Error(`missing value for ${name}`)
    }
    const value =
      def.type === "number" ? Number(raw) : def.type === "int" ? Number.parseInt(raw, 10) : raw
    if ((def.type === "number" || def.type === "int") && Number.isNaN(value)) {
      throw new Error(`invalid number for ${name}: ${raw}`)
    }
    if (def.list) {
      values[def.key] = [...(values[def.key] ?? []), value]
    } else {
      values[def.key] = value
    }
    index += 1
  }

  return { values, positionals }
}

/** Split `--url` / `--json` globals from anywhere in the argv. */
export function splitGlobals(argv) {
  const rest = []
  let url
  let json = false
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === "--url") {
      index += 1
      url = argv[index]
    } else if (token.startsWith("--url=")) {
      url = token.slice("--url=".length)
    } else if (token === "--json") {
      json = true
    } else {
      rest.push(token)
    }
  }
  return { rest, url, json }
}
