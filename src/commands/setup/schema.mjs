import { readFileSync } from "node:fs"

import Ajv2020 from "ajv/dist/2020.js"

const schema = JSON.parse(readFileSync(new URL("./manifest.schema.json", import.meta.url), "utf8"))

const ajv = new Ajv2020({ allErrors: true, strict: false })
const validate = ajv.compile(schema)

export function validateManifest(value) {
  const ok = validate(value)
  return {
    ok,
    errors: ok
      ? []
      : (validate.errors ?? []).map(
          (error) => `${error.instancePath || "/"} ${error.message ?? "invalid"}`,
        ),
  }
}

export function assertManifest(value) {
  const { ok, errors } = validateManifest(value)
  if (!ok) throw new Error(`invalid manifest: ${errors.join("; ")}`)
  return value
}
