import { readFileSync } from "node:fs"

const META_CONTROL = new Set(["fixed", "randomize", "increment", "decrement"])

function valueAllowed(spec, value) {
  const first = Array.isArray(spec) ? spec[0] : undefined
  if (typeof first === "string") return first.includes(value)
  if (Array.isArray(first)) return first.includes(value)
  return false
}

/** Frontend workflow JSON -> API prompt. */
export function convert(workflow, info) {
  const prompt = {}
  const links = new Map((workflow.links ?? []).map((link) => [link[0], link]))
  for (const node of workflow.nodes ?? []) {
    if (node.mode === 2 || node.mode === 4) continue
    const type = node.type
    const spec = info[type]
    if (!spec) {
      process.stderr.write(`WARN: node ${type} not registered on the server\n`)
      continue
    }
    const widgets = [...(node.widgets_values ?? [])]
    const sockets = Object.fromEntries((node.inputs ?? []).map((input) => [input.name, input]))
    const inputs = {}
    let widgetIndex = 0

    for (const section of ["required", "optional"]) {
      for (const [name, definition] of Object.entries(spec.input?.[section] ?? {})) {
        if (name === "control_after_generate" || name === "upload") continue
        if (name in sockets || widgetIndex >= widgets.length) continue
        let value = widgets[widgetIndex]
        widgetIndex += 1
        if (META_CONTROL.has(value) && !valueAllowed(definition, value)) {
          if (widgetIndex >= widgets.length) continue
          value = widgets[widgetIndex]
          widgetIndex += 1
        }
        if (
          typeof value === "boolean" &&
          Array.isArray(definition) &&
          typeof definition[0] === "string"
        ) {
          value = value ? "enable" : "disable"
        }
        inputs[name] = value
      }
    }

    for (const [name, input] of Object.entries(sockets)) {
      const linkId = input.link
      if (linkId === null || linkId === undefined) continue
      const link = links.get(linkId)
      if (!link) continue
      inputs[name] = [String(link[1]), link[2]]
    }
    prompt[String(node.id)] = { class_type: type, inputs }
  }
  return prompt
}

export function loadPrompt(path, info) {
  const workflow = JSON.parse(readFileSync(path, "utf8"))
  if (workflow.nodes) return convert(workflow, info)
  if (workflow.prompt) return workflow.prompt
  return workflow
}

export function toValue(raw) {
  const text = String(raw)
  if (/^-?\d+$/.test(text)) return Number.parseInt(text, 10)
  if (/^-?\d*\.\d+$/.test(text)) return Number.parseFloat(text)
  if (text.toLowerCase() === "true" || text.toLowerCase() === "false") {
    return text.toLowerCase() === "true"
  }
  return text
}

export function applyOverrides(prompt, overrides) {
  for (const override of overrides) {
    const equals = override.indexOf("=")
    const key = equals >= 0 ? override.slice(0, equals) : override
    const rawValue = equals >= 0 ? override.slice(equals + 1) : ""
    const dot = key.indexOf(".")
    const nodeId = dot >= 0 ? key.slice(0, dot) : key
    const param = dot >= 0 ? key.slice(dot + 1) : ""
    if (!rawValue || !param || !prompt[nodeId]?.inputs) {
      process.stderr.write(
        `WARN: cannot apply override '${override}' (expected NODE.PARAM=VALUE)\n`,
      )
      continue
    }
    prompt[nodeId].inputs[param] = toValue(rawValue)
    console.log(`override: node ${nodeId} ${param} = ${prompt[nodeId].inputs[param]}`)
  }
}
