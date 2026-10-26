import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { ensureVoice, systemLocale, voiceForLocale, voiceStatus } from "../src/lib/piper.mjs"

test("systemLocale honors LANGUAGE/LC_ALL/LANG and normalizes the result", () => {
  assert.equal(systemLocale({ LANG: "en_US.UTF-8" }), "en-US")
  assert.equal(systemLocale({ LANG: "es_ES.UTF-8" }), "es-ES")
  assert.equal(systemLocale({ LANGUAGE: "fr_FR:fr" }), "fr-FR")
})

test("voiceForLocale prefers the exact locale, then language default, then English", () => {
  assert.equal(voiceForLocale("es-MX").id, "es_MX-ald-medium")
  assert.equal(voiceForLocale("es-ES").id, "es_ES-davefx-medium")
  assert.equal(voiceForLocale("fr-CA").id, "fr_FR-siwis-medium")
  assert.deepEqual(voiceForLocale("xx-YY"), {
    id: "en_US-lessac-medium",
    locale: "en-US",
    language: "en",
    fallback: true,
  })
})

test("voiceStatus finds a downloaded voice under ~/.mllt", () => {
  const home = mkdtempSync(join(tmpdir(), "piper-home-"))
  try {
    const path = join(home, ".mllt", "piper-voices", "en_US-lessac-medium.onnx")
    mkdirSync(join(home, ".mllt", "piper-voices"), { recursive: true })
    writeFileSync(path, "model")
    const status = voiceStatus({ locale: "en-US", env: {}, home })
    assert.equal(status.exists, true)
    assert.equal(status.voice, "en_US-lessac-medium")
    assert.equal(status.path, path)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test("ensureVoice downloads the language voice with an English fallback", async () => {
  const dir = mkdtempSync(join(tmpdir(), "piper-download-"))
  const urls = []
  const fetchImpl = async (url) => {
    urls.push(url)
    return { ok: true, arrayBuffer: async () => Buffer.from("voice") }
  }
  try {
    const fallback = await ensureVoice({
      locale: "xx-YY",
      dir,
      fetchImpl,
      log: () => {},
    })
    assert.equal(fallback.id, "en_US-lessac-medium")
    assert.equal(fallback.downloaded, true)
    assert.equal(urls.length, 2)
    assert.match(urls[0], /en\/en_US\/lessac\/medium\/en_US-lessac-medium\.onnx$/)
    assert.match(urls[1], /\.onnx\.json$/)

    const spanish = await ensureVoice({
      locale: "es-MX",
      dir,
      fetchImpl,
      log: () => {},
    })
    assert.equal(spanish.id, "es_MX-ald-medium")
    assert.match(urls[2], /es\/es_MX\/ald\/medium\/es_MX-ald-medium\.onnx$/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
