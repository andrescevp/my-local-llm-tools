import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { DatabaseSync } from "node:sqlite"

import { selectorDbPath } from "./browser-paths.mjs"

const SCHEMA = `
CREATE TABLE IF NOT EXISTS selectors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page TEXT NOT NULL,
  field TEXT NOT NULL,
  selector TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'css',
  extract_mode TEXT NOT NULL DEFAULT 'text',
  extract_attr TEXT,
  confidence REAL NOT NULL DEFAULT 0.7,
  success_count INTEGER NOT NULL DEFAULT 0,
  fail_count INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'taught',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(page, field, selector)
);
CREATE TABLE IF NOT EXISTS recordings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  path TEXT NOT NULL,
  steps INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`

export function openBrowserDb(env = process.env) {
  const path = selectorDbPath(env)
  mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec(SCHEMA)
  return { db, path }
}

export function listSelectors(db, { page = "", field = "" } = {}) {
  const where = []
  const values = []
  if (page) {
    where.push("page = ?")
    values.push(page)
  }
  if (field) {
    where.push("field = ?")
    values.push(field)
  }
  const sql = `SELECT * FROM selectors${where.length ? ` WHERE ${where.join(" AND ")}` : ""}
    ORDER BY page, field, confidence DESC, updated_at DESC`
  return db.prepare(sql).all(...values)
}

export function findSelectors(db, page, field) {
  return db
    .prepare(
      `SELECT * FROM selectors WHERE page = ? AND field = ?
       ORDER BY confidence DESC, success_count DESC, updated_at DESC`,
    )
    .all(page, field)
}

export function upsertSelector(db, input) {
  const confidence = Math.max(0.05, Math.min(0.99, Number(input.confidence ?? 0.7)))
  db.prepare(
    `INSERT INTO selectors (page, field, selector, kind, extract_mode, extract_attr, confidence, source, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(page, field, selector) DO UPDATE SET
       confidence = MAX(selectors.confidence, excluded.confidence),
       source = excluded.source,
       extract_mode = excluded.extract_mode,
       extract_attr = excluded.extract_attr,
       notes = COALESCE(excluded.notes, selectors.notes),
       updated_at = CURRENT_TIMESTAMP`,
  ).run(
    input.page,
    input.field,
    input.selector,
    input.kind ?? "css",
    input.extractMode ?? "text",
    input.extractAttr ?? null,
    confidence,
    input.source ?? "taught",
    input.notes ?? null,
  )
  return findSelectors(db, input.page, input.field).find((row) => row.selector === input.selector)
}

export function recordSelectorOutcome(db, id, success) {
  db.prepare(
    `UPDATE selectors SET
       success_count = success_count + ?,
       fail_count = fail_count + ?,
       confidence = MIN(0.99, MAX(0.05, confidence * 0.6 + ? * 0.4)),
       updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
  ).run(success ? 1 : 0, success ? 0 : 1, success ? 0.85 : 0.25, id)
}

export function removeSelector(db, id) {
  return db.prepare("DELETE FROM selectors WHERE id = ?").run(id).changes > 0
}

export function resetSelectors(db, page = "") {
  if (page) return db.prepare("DELETE FROM selectors WHERE page = ?").run(page).changes
  return db.prepare("DELETE FROM selectors").run().changes
}

export function selectorStats(db) {
  return db
    .prepare(
      `SELECT COUNT(*) AS total,
        SUM(CASE WHEN confidence >= 0.7 THEN 1 ELSE 0 END) AS healthy,
        SUM(CASE WHEN confidence < 0.4 THEN 1 ELSE 0 END) AS weak
       FROM selectors`,
    )
    .get()
}

export function upsertRecording(db, { name, path, steps }) {
  db.prepare(
    `INSERT INTO recordings (name, path, steps) VALUES (?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET path = excluded.path, steps = excluded.steps,
       updated_at = CURRENT_TIMESTAMP`,
  ).run(name, path, steps)
}

export function listRecordingsDb(db) {
  return db.prepare("SELECT * FROM recordings ORDER BY name").all()
}

export function deleteRecordingDb(db, name) {
  return db.prepare("DELETE FROM recordings WHERE name = ?").run(name).changes > 0
}
