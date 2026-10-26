function helpers() {
  return `
const stable = (el) => {
  const tag = el.tagName.toLowerCase();
  if (el.getAttribute("data-testid")) return \`[data-testid="\${el.getAttribute("data-testid").replace(/"/g, '\\\\"')}"]\`;
  if (el.id && /^[A-Za-z][\\w:-]{2,60}$/.test(el.id) && !/\\d{5,}/.test(el.id)) return \`#\${el.id}\`;
  for (const attr of ["aria-label", "name"]) {
    const value = el.getAttribute(attr);
    if (value && value.length < 120) return \`\${tag}[\${attr}="\${value.replace(/"/g, '\\\\"')}"]\`;
  }
  if (tag === "a") {
    const href = el.getAttribute("href") || "";
    if (href && !href.startsWith("javascript:")) {
      const path = href.split("?")[0];
      if (path.length > 1 && path.length < 120) return \`a[href*="\${path.replace(/"/g, '\\\\"')}"]\`;
    }
  }
  return "";
};
const structural = (el) => {
  const parts = [];
  let node = el;
  for (let depth = 0; node && node.nodeType === 1 && depth < 5; depth += 1) {
    const tag = node.tagName.toLowerCase();
    const parent = node.parentElement;
    if (!parent) { parts.unshift(tag); break; }
    const same = [...parent.children].filter((child) => child.tagName === node.tagName);
    parts.unshift(\`\${tag}:nth-of-type(\${same.indexOf(node) + 1})\`);
    node = parent;
  }
  return parts.join(" > ");
};
const selectorFor = (el) => {
  const direct = stable(el);
  if (direct) {
    try { if (document.querySelectorAll(direct).length === 1) return direct; } catch {}
  }
  const tag = el.tagName.toLowerCase();
  const classes = [...el.classList]
    .filter((name) => /^[A-Za-z][A-Za-z0-9_-]{0,48}$/.test(name))
    .filter((name) => !/^(css|sc|jsx|svelte|emotion)-/i.test(name))
    .slice(0, 2);
  if (classes.length) {
    const candidate = \`\${tag}.\${classes.join(".")}\`;
    try { if (document.querySelectorAll(candidate).length === 1) return candidate; } catch {}
  }
  return structural(el);
};
const normalize = (value) => String(value ?? "").replace(/\\s+/g, " ").trim();
`
}

export const RECORDER_SCRIPT = `(() => {${helpers()}
  if (window.__mlltRecorderInstalled) return;
  window.__mlltRecorderInstalled = true;
  const emit = (type, el, value) => {
    if (!el || !el.tagName || !window.__mlltRecord) return;
    window.__mlltRecord({ type, selector: selectorFor(el), value: value ?? null, url: location.href, ts: Date.now() });
  };
  document.addEventListener("click", (event) => emit("click", event.target), true);
  document.addEventListener("change", (event) => {
    emit(event.target?.tagName === "SELECT" ? "select" : "fill", event.target, event.target.value);
  }, true);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Enter") emit("press", event.target, "Enter");
  }, true);
  window.addEventListener("load", () => {
    window.__mlltRecord?.({ type: "navigate", selector: "", value: location.href, url: location.href, ts: Date.now() });
  });
})()`
