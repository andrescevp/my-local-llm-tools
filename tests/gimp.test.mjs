import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { listMacros, newMacro, renderMacro } from "../src/commands/gimp/macros.mjs"
import { buildScript } from "../src/commands/gimp/script.mjs"

test("buildScript resizes and saves with GIMP 3 Python-Fu", () => {
  const code = buildScript("resize", {
    input: "/tmp/in.png",
    output: "/tmp/out.png",
    width: 320,
    height: 200,
  })
  assert.match(code, /Gimp\.file_load/)
  assert.match(code, /img\.scale\(320, 200\)/)
  assert.match(code, /Gimp\.file_save/)
})

test("buildScript converts color operations and filters", () => {
  assert.match(
    buildScript("brightness-contrast", {
      input: "/tmp/in.png",
      output: "/tmp/out.png",
      brightness: 10,
      contrast: 5,
    }),
    /d\.brightness_contrast\(10, 5\)/,
  )
  assert.match(
    buildScript("blur", {
      input: "/tmp/in.png",
      output: "/tmp/out.png",
      radius: 3,
    }),
    /gegl:gaussian-blur/,
  )
})

test("renderMacro substitutes input, output, and params", () => {
  const source = "load({input}); save({output}); {param:text}"
  assert.equal(
    renderMacro(source, {
      input: "/tmp/a.png",
      output: "/tmp/b.png",
      params: { text: "hello" },
      extension: ".py",
    }),
    'load("/tmp/a.png"); save("/tmp/b.png"); "hello"',
  )
})

test("renderMacro rejects missing or invalid params", () => {
  assert.throws(() => renderMacro("{param:missing}", { input: "a", output: "b", params: {} }))
  assert.throws(() => renderMacro("x", { input: "a", output: "b", params: { "bad key": "x" } }))
})

test("newMacro scaffolds and listMacros finds it", () => {
  const dir = mkdtempSync(join(tmpdir(), "gimp-macros-"))
  try {
    const file = newMacro("demo", { dir })
    assert.match(readFileSync(file, "utf8"), /name: demo/)
    assert.deepEqual(
      listMacros(dir).map((entry) => entry.name),
      ["demo"],
    )
    assert.throws(() => newMacro("demo", { dir }))
    writeFileSync(join(dir, "other.scm"), "(gimp-quit 0)\n")
    assert.deepEqual(
      listMacros(dir).map((entry) => entry.name),
      ["demo", "other"],
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
