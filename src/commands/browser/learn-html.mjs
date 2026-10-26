import { parseHTML } from "linkedom"

function normalize(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
}

function cssEscape(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
}

function tagOf(element) {
  return String(element?.tagName ?? "").toLowerCase()
}

function structural(element, root) {
  const parts = []
  let node = element
  let depth = 0
  while (node && node !== root && node.nodeType === 1 && depth < 5) {
    const tag = tagOf(node)
    const parent = node.parentElement
    if (!parent) break
    const same = [...parent.children].filter((child) => tagOf(child) === tag)
    parts.unshift(`${tag}:nth-of-type(${same.indexOf(node) + 1})`)
    node = parent
    depth += 1
  }
  if (node && node !== root && /^[a-zA-Z]/.test(tagOf(node))) parts.unshift(tagOf(node))
  return parts.join(" > ")
}

function stableSelector(element) {
  const tag = tagOf(element)
  const testId = element.getAttribute?.("data-testid")
  if (testId) return `[data-testid="${cssEscape(testId)}"]`
  const id = element.getAttribute?.("id")
  if (id && /^[A-Za-z][\w:-]{2,60}$/.test(id) && !/\d{5,}/.test(id)) return `#${id}`
  for (const attr of ["aria-label", "name"]) {
    const value = element.getAttribute?.(attr)
    if (value && value.length < 120) return `${tag}[${attr}="${cssEscape(value)}"]`
  }
  if (tag === "a") {
    const href = element.getAttribute?.("href") ?? ""
    const path = href.split("?")[0]
    if (path.length > 1 && path.length < 120 && !path.startsWith("javascript:")) {
      return `a[href*="${cssEscape(path)}"]`
    }
  }
  return ""
}

export function loadDocument(html) {
  try {
    return parseHTML(String(html ?? "")).document
  } catch {
    return null
  }
}

export function selectorForElement(document, element) {
  if (!document || !element) return ""
  const stable = stableSelector(element)
  if (stable) {
    try {
      if (document.querySelectorAll(stable).length === 1) return stable
    } catch {
      // fall through
    }
  }
  const tag = tagOf(element)
  const classes = [...(element.classList ?? [])]
    .filter((name) => /^[A-Za-z][A-Za-z0-9_-]{0,48}$/.test(name))
    .filter((name) => !/^(css|sc|jsx|svelte|emotion)-/i.test(name))
    .slice(0, 2)
  if (classes.length) {
    const candidate = `${tag}.${classes.join(".")}`
    try {
      if (document.querySelectorAll(candidate).length === 1) return candidate
    } catch {
      // fall through
    }
  }
  return structural(element, document)
}

export function selectorForValue(html, value) {
  const document = loadDocument(html)
  if (!document) return null
  const wanted = normalize(value)
  if (!wanted) return null
  const candidates = [...document.querySelectorAll("*")].filter((element) => {
    const text = normalize(element.textContent)
    return (
      text === wanted ||
      (wanted.length >= 4 &&
        text.includes(wanted) &&
        text.length <= Math.max(wanted.length * 3, wanted.length + 500))
    )
  })
  candidates.sort((a, b) => normalize(a.textContent).length - normalize(b.textContent).length)
  if (!candidates.length) return null
  const selector = selectorForElement(document, candidates[0])
  return { selector, count: document.querySelectorAll(selector).length }
}

export function extractFromHtml(html, selector, mode = "text", attr = "") {
  const document = loadDocument(html)
  if (!document) return { count: 0, values: [], error: "HTML could not be parsed" }
  let nodes
  try {
    nodes = [...document.querySelectorAll(selector)]
  } catch (error) {
    return { count: 0, values: [], error: String(error) }
  }
  const values = nodes.map((node) => {
    if (mode === "html") return node.innerHTML
    if (mode === "attr" || mode === "href") return node.getAttribute(attr || "href") ?? ""
    return normalize(node.textContent)
  })
  return { count: nodes.length, values }
}
