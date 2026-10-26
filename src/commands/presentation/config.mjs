import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import Ajv2020 from "ajv/dist/2020.js"

const HERE = dirname(fileURLToPath(import.meta.url))
const schema = JSON.parse(readFileSync(join(HERE, "config.schema.json"), "utf8"))
const ajv = new Ajv2020({ allErrors: true, strict: false })
const validate = ajv.compile(schema)

export function validateConfig(config) {
  if (!validate(config)) {
    const errors = (validate.errors ?? []).map(
      (error) => `${error.instancePath || "/"} ${error.message ?? "invalid"}`,
    )
    throw new Error(`invalid presentation config: ${errors.join("; ")}`)
  }
  return config
}

export function loadConfig(path) {
  let config
  try {
    config = JSON.parse(readFileSync(path, "utf8"))
  } catch (error) {
    throw new Error(`cannot read config ${path}: ${error.message}`)
  }
  return validateConfig(config)
}
