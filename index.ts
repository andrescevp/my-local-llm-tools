// cheap-ai-winth-local-tools — OpenCode V2 plugin.
//
// Registers the bundled skills (skills/*/SKILL.md, metadata from
// skills/manifest.json) and injects a compact inventory into every session.
// This harness is skills-only: no agents are installed as files.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { Plugin } from "@opencode/plugin"

const HARNESS_ID = "cheap-ai-winth-local-tools"
const CONTEXT_MARKER = "## Cheap AI Local Tools"

const SUMMARIES: Record<string, string> = {
  "image-analysis": "describe/compare images with local Ollama vision models",
  ocr: "extract text and structure from images/documents locally",
  autoskills: "analyze a project and propose skills, authored via create-skill",
  "create-skill": "create, update, and evaluate agent skills",
  "create-agent": "create, optimize, and validate custom agents",
  "openai-api-usage": "call OpenAI and OpenAI-compatible APIs (llama.cpp, Ollama, vLLM)",
  setup: "detect dependencies, write the machine manifest, and diagnose the harness",
  "video-analysis": "describe and summarize local videos with minicpm frame sampling",
  speak: "text-to-speech in Spanish via local piper-tts",
  "comfyui-server": "generate video/image/music/voice with local ComfyUI",
}

interface SkillMeta {
  id: string
  name: string
  description: string
}

interface Manifest {
  skills: SkillMeta[]
}

interface LoadedSkill extends SkillMeta {
  location: string
  content: string
}

function loadSkills(root: string): LoadedSkill[] {
  let manifest: Manifest | undefined
  try {
    manifest = JSON.parse(readFileSync(join(root, "skills", "manifest.json"), "utf8")) as Manifest
  } catch {
    console.warn(`[${HARNESS_ID}] skills/manifest.json missing — run scripts/build_manifest.py`)
    return []
  }
  const entries: LoadedSkill[] = []
  for (const meta of manifest.skills) {
    const location = join(root, "skills", meta.id, "SKILL.md")
    try {
      entries.push({ ...meta, location, content: readFileSync(location, "utf8") })
    } catch {
      console.warn(`[${HARNESS_ID}] missing SKILL.md for '${meta.id}'`)
    }
  }
  return entries
}

function contextBlock(skills: LoadedSkill[], root: string): string {
  const lines = [
    CONTEXT_MARKER,
    "",
    "Local-first, low-cost AI toolbelt. Everything runs on this machine.",
    "Endpoints: Ollama http://127.0.0.1:11434 · ComfyUI http://127.0.0.1:8188 ·",
    "llama.cpp http://127.0.0.1:8080 (only while a managed server is running).",
    "",
    `Bundled skills (root: ${join(root, "skills")}):`,
  ]
  for (const skill of skills) {
    lines.push(`- ${skill.id}: ${SUMMARIES[skill.id] ?? "local tool"}`)
  }
  lines.push(
    "",
    "Use the skill tool to load full instructions. When running a bundled script,",
    'set SKILL_DIR to the skill folder reported by the skill loader and use "$SKILL_DIR/...".',
    "Never delete models, pull multi-GB files, or kill local servers without explicit user approval.",
  )
  return lines.join("\n")
}

export default Plugin.define({
  id: HARNESS_ID,
  async setup(ctx) {
    const root = ctx.location.directory ?? fileURLToPath(new URL(".", import.meta.url))
    const skills = loadSkills(root)

    await ctx.skill.transform((editor) => {
      for (const skill of skills) {
        editor.add(skill)
      }
    })

    const block = contextBlock(skills, root)
    await ctx.session.hook("context", (event) => {
      const already = event.system.some(
        (part) => part.type === "text" && part.text.includes(CONTEXT_MARKER),
      )
      if (!already) {
        event.system.push({ type: "text", text: block })
      }
    })
  },
})
