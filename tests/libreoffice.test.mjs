import assert from "node:assert/strict"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { buildConvertArgs, probeLibreOffice, resolveLibreOffice } from "../src/lib/libreoffice.mjs"

test("LIBREOFFICE_BIN wins and must exist", () => {
  const found = resolveLibreOffice({
    env: { LIBREOFFICE_BIN: "/opt/lo/soffice" },
    exists: (path) => path === "/opt/lo/soffice",
  })
  assert.deepEqual(found, { ok: true, path: "/opt/lo/soffice", source: "env" })
  const missing = resolveLibreOffice({
    env: { LIBREOFFICE_BIN: "/missing/soffice" },
    exists: () => false,
  })
  assert.equal(missing.ok, false)
  assert.equal(missing.source, "env")
})

test("system LibreOffice is preferred over ~/.mllt", () => {
  const found = resolveLibreOffice({
    env: {},
    platform: "linux",
    home: "/home/demo",
    exists: (path) =>
      ["/usr/bin/soffice", "/home/demo/.mllt/libreoffice/program/soffice"].includes(path),
    which: () => "/usr/bin/soffice",
  })
  assert.equal(found.path, "/usr/bin/soffice")
  assert.equal(found.source, "system")
})

test("~/.mllt is the fallback when the system has no LibreOffice", () => {
  const found = resolveLibreOffice({
    env: {},
    platform: "linux",
    home: "/home/demo",
    exists: (path) => path === "/home/demo/.mllt/libreoffice/program/soffice",
    which: () => "",
  })
  assert.equal(found.path, "/home/demo/.mllt/libreoffice/program/soffice")
  assert.equal(found.source, "lih")
})

test("buildConvertArgs uses an isolated profile and argv array", () => {
  const args = buildConvertArgs({
    filter: "pdf",
    outDir: "/tmp/out",
    profileDir: "/tmp/profile",
    input: "/tmp/in.docx",
  })
  assert.ok(args.includes("--headless"))
  assert.ok(args.includes("pdf"))
  assert.ok(args.includes(`-env:UserInstallation=${pathToFileURL("/tmp/profile").href}`))
  assert.equal(args.at(-1), "/tmp/in.docx")
})

test("probeLibreOffice reports the first version line", () => {
  const result = probeLibreOffice("/usr/bin/soffice", {
    run: () => ({ status: 0, stdout: "LibreOffice 26.8.1\nmore\n", stderr: "" }),
  })
  assert.equal(result.ok, true)
  assert.equal(result.version, "LibreOffice 26.8.1")
})
