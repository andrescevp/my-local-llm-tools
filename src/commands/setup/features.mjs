export const FEATURES = {
  "image-analysis": { requires: ["ollama", "model:minicpm-v4.6:latest"] },
  ocr: {
    requires: ["ollama", "model:MedAIBase/PaddleOCR-VL:0.9b"],
    optional: ["tesseract"],
  },
  "video-analysis": {
    requires: ["ollama", "model:minicpm-v4.6:latest", "ffmpeg", "ffprobe"],
  },
  "comfyui-server": { requires: ["comfyui"] },
  speak: { requires: ["piper", "voice"] },
  setup: { requires: ["node", "pnpm"] },
  "openai-api-usage": { requires: [] },
  "ccreate-skill": { requires: [] },
  "ccreate-agent": { requires: [] },
  autoskills: { requires: [] },
  "convert-files": { requires: ["libreoffice"] },
  "autoedit-with-gimp": { requires: ["gimp"] },
  "autoedit-with-inkscape": { requires: ["inkscape"], optional: ["potrace"] },
  "image-background-removal": { requires: ["u2net_model"], optional: ["gimp"] },
  "presentations-generator": { requires: [], optional: ["playwright"] },
}

function satisfied(name, context) {
  const { tools, ollama, comfyui } = context
  if (name === "ollama") return ollama.reachable
  if (name.startsWith("model:")) {
    return ollama.models.available.includes(name.slice("model:".length))
  }
  if (name === "comfyui") return comfyui.reachable
  if (name === "voice") return tools.voice_model.ok
  return Boolean(tools[name]?.ok)
}

export function evaluateFeatures(context) {
  const result = {}
  for (const [name, spec] of Object.entries(FEATURES)) {
    const requires = spec.requires.map((requirement) => ({
      requirement,
      ok: satisfied(requirement, context),
    }))
    const optional = (spec.optional ?? []).map((requirement) => ({
      requirement,
      ok: satisfied(requirement, context),
    }))
    result[name] = {
      ok: requires.every((item) => item.ok),
      requires,
      optional,
    }
  }
  return result
}

export function featureOk(manifest, skill) {
  return Boolean(manifest?.features?.[skill]?.ok)
}
