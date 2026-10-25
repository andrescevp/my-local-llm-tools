import { parseFlags } from "../lib/args.mjs"
import { encodeImage, formatOutput, runWithFallback } from "../lib/vision.mjs"

const VISION_SPEC = {
  "--image": { key: "image", list: true },
  "--prompt": { key: "prompt" },
  "--model": { key: "model" },
  "--mode": { key: "mode" },
  "--ollama-url": { key: "ollamaUrl" },
  "--format": { key: "format" },
  "--timeout": { key: "timeout", type: "int" },
}

export async function runVisionCommand(argv, config) {
  if (argv.includes("-h") || argv.includes("--help")) {
    process.stdout.write(config.help)
    return 0
  }
  let values
  try {
    values = parseFlags(argv, VISION_SPEC).values
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${config.help}`)
    return 2
  }
  if (!values.image?.length) {
    process.stderr.write(config.help)
    return 2
  }
  const model = values.model ?? config.model
  const prompt = config.promptFor
    ? config.promptFor(values, model)
    : (values.prompt ?? config.prompt)
  try {
    const result = await runWithFallback({
      ollamaUrl: values.ollamaUrl ?? config.url,
      model,
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
