import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { parseFlags } from "../lib/args.mjs"
import { hasCommand } from "../lib/exec.mjs"
import {
  DEFAULT_OCR_PROMPT,
  DEFAULT_OLLAMA,
  encodeImage,
  formatOutput,
  OCR_MODEL,
  runWithFallback,
} from "../lib/vision.mjs"

const MAX_CONTEXT = 12000
const DEFAULT_TESSERACT_LANG = "spa+eng"

const SPEC = {
  "--image": { key: "image", list: true },
  "--prompt": { key: "prompt" },
  "--model": { key: "model" },
  "--ollama-url": { key: "ollamaUrl" },
  "--format": { key: "format" },
  "--timeout": { key: "timeout", type: "int" },
  "--tesseract": { key: "tesseract", type: "boolean" },
  "--no-tesseract": { key: "noTesseract", type: "boolean" },
  "--feedback": { key: "feedback" },
  "--previous": { key: "previous" },
  "--tesseract-lang": { key: "tesseractLang" },
  "--psm": { key: "psm", type: "int" },
}

export const OCR_HELP = `Usage: node src/cli.mjs ocr --image PATH [--image PATH...] [options]

Options:
  --image PATH            Absolute input image (repeatable, required)
  --prompt TEXT           Instruction prompt
  --model NAME            Ollama model (default: ${OCR_MODEL})
  --ollama-url URL        Ollama base URL (default: ${DEFAULT_OLLAMA})
  --format FORMAT         markdown | json | raw (default: markdown)
  --timeout SECONDS       Request timeout (default: 120)

Correction pass:
  --feedback TEXT         User-reported errors/missing data; enables Tesseract
  --previous FILE         Previous extraction to correct; enables Tesseract
  --tesseract             Force Tesseract as complementary evidence
  --no-tesseract          Disable Tesseract even in a correction pass
  --tesseract-lang LANGS  Tesseract languages (default: ${DEFAULT_TESSERACT_LANG})
  --psm N                 Tesseract page segmentation mode (default: 3)
`

function clip(text) {
  const value = String(text ?? "").trim()
  return value.length > MAX_CONTEXT ? `${value.slice(0, MAX_CONTEXT)}\n[truncated]` : value
}

function hasBinary(name) {
  return hasCommand(name)
}

export function shouldUseTesseract(values) {
  if (values.noTesseract) return false
  return Boolean(values.tesseract || values.feedback || values.previous)
}

export function buildOcrPrompt({ base, previous, feedback, tesseract }) {
  const parts = [base]
  if (previous) {
    parts.push(`Previous extraction to correct:\n${clip(previous)}`)
  }
  if (feedback) {
    parts.push(
      "The user reported these problems with the previous extraction:\n" +
        `${clip(feedback)}\n` +
        "Fix them and recover missing data. Do not invent content.",
    )
  }
  if (tesseract) {
    parts.push(
      "Complementary Tesseract OCR output (raw; may contain errors):\n" +
        `${clip(tesseract)}\n` +
        "Reconcile it with the image. When they disagree, trust the image and mark uncertainty.",
    )
  }
  return parts.join("\n\n")
}

function runTesseract(path, lang, psm) {
  const proc = spawnSync("tesseract", [path, "stdout", "-l", lang, "--psm", String(psm)], {
    encoding: "utf8",
    timeout: 60000,
  })
  if (proc.status !== 0) {
    throw new Error((proc.stderr || "tesseract failed").trim().split("\n")[0])
  }
  return proc.stdout.trim()
}

function collectTesseract(paths, lang, psm) {
  const chunks = []
  for (const path of paths) {
    try {
      const text = runTesseract(path, lang, psm)
      if (text) chunks.push(`--- ${path} ---\n${text}`)
    } catch (error) {
      process.stderr.write(`WARN: tesseract failed for ${path}: ${error.message}\n`)
    }
  }
  return chunks.join("\n\n")
}

export async function ocr(argv) {
  if (argv.includes("-h") || argv.includes("--help")) {
    process.stdout.write(OCR_HELP)
    return 0
  }
  let values
  try {
    values = parseFlags(argv, SPEC).values
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${OCR_HELP}`)
    return 2
  }
  if (!values.image?.length) {
    process.stderr.write(OCR_HELP)
    return 2
  }

  let previous = ""
  if (values.previous) {
    try {
      previous = readFileSync(resolve(values.previous), "utf8")
    } catch (error) {
      process.stderr.write(`ERROR: cannot read --previous file: ${error.message}\n`)
      return 1
    }
  }

  let tesseractText = ""
  if (shouldUseTesseract(values)) {
    if (!hasBinary("tesseract")) {
      if (values.tesseract) {
        process.stderr.write(
          "ERROR: tesseract not found (sudo pacman -S tesseract tesseract-data-spa tesseract-data-eng)\n",
        )
        return 1
      }
      process.stderr.write("WARN: tesseract not found; continuing without complementary OCR\n")
    } else {
      tesseractText = collectTesseract(
        values.image,
        values.tesseractLang ?? DEFAULT_TESSERACT_LANG,
        values.psm ?? 3,
      )
    }
  }

  const prompt = buildOcrPrompt({
    base: values.prompt ?? DEFAULT_OCR_PROMPT,
    previous,
    feedback: values.feedback,
    tesseract: tesseractText,
  })

  try {
    const result = await runWithFallback({
      ollamaUrl: values.ollamaUrl ?? DEFAULT_OLLAMA,
      model: values.model ?? OCR_MODEL,
      prompt,
      encodedImages: values.image.map(encodeImage),
      timeout: values.timeout ?? 120,
    })
    console.log(formatOutput(result, values.format ?? "markdown"))
    return 0
  } catch (error) {
    process.stderr.write(`ERROR: ${error.message}\n`)
    return 1
  }
}
