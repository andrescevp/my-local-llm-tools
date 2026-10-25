// my-local-llm-tools — OpenCode V2 plugin.
//
// Registers the bundled skills (skills/*/SKILL.md, metadata from
// skills/manifest.json) and injects a compact inventory into every session.
// This harness is skills-only: no agents are installed as files.

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { Plugin } from "@opencode/plugin"

const HARNESS_ID = "my-local-llm-tools"
const CONTEXT_MARKER = "## my-local-llm-tools"

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
  path: string
  content: string
}

function renderSkillContent(content: string, root: string, skillDir: string): string {
  const pluginRoot = root.replaceAll("\\", "/")
  const directory = skillDir.replaceAll("\\", "/")
  return content
    .replaceAll("${CLAUDE_PLUGIN_ROOT}", pluginRoot)
    .replaceAll("${CLAUDE_SKILL_DIR}", directory)
}

function loadSkills(root: string): LoadedSkill[] {
  let manifest: Manifest | undefined
  try {
    manifest = JSON.parse(readFileSync(join(root, "skills", "manifest.json"), "utf8")) as Manifest
  } catch {
    console.warn(`[${HARNESS_ID}] skills/manifest.json missing — run pnpm manifest`)
    return []
  }
  const entries: LoadedSkill[] = []
  for (const meta of manifest.skills) {
    const skillDir = join(root, "skills", meta.id)
    const path = join(skillDir, "SKILL.md")
    try {
      const content = renderSkillContent(readFileSync(path, "utf8"), root, skillDir)
      entries.push({ ...meta, path, content })
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
    "llama.cpp http://127.0.0.1:8080 (optional OpenAI-compatible server).",
    "",
    `Bundled skills (root: ${join(root, "skills")}):`,
  ]
  for (const skill of skills) {
    lines.push(`- ${HARNESS_ID}:${skill.id}: ${SUMMARIES[skill.id] ?? "local tool"}`)
  }
  lines.push(
    "",
    "Use the skill tool to load full instructions. For bundled CLI commands,",
    `run "node ${join(root, "src", "cli.mjs")}" (or "pnpm cli" from the repository root).`,
    "Never delete models, pull multi-GB files, or kill local servers without explicit user approval.",
  )
  return lines.join("\n")
}

export default Plugin.define({
  id: HARNESS_ID,
  async setup(ctx) {
    const root = dirname(fileURLToPath(import.meta.url))
    const skills = loadSkills(root)

    await ctx.skill.transform((editor) => {
      for (const skill of skills) {
        editor.add({
          ...skill,
          id: `${HARNESS_ID}:${skill.id}`,
        } as Parameters<typeof editor.add>[0])
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
