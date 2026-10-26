// my-local-llm-tools — OpenCode V2 plugin.
//
// Registers the bundled skills discovered from skills/*/SKILL.md and injects a
// compact inventory into every session. Machine facts (endpoints, readiness)
// are read from the manifest written by `setup`; nothing about the host is
// hardcoded here.

import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { Plugin } from "@opencode/plugin"

import { manifestPath, readManifest } from "./src/commands/setup/manifest.mjs"
import { discoverSkills, renderSkillContent } from "./src/lib/skills.mjs"

const HARNESS_ID = "my-local-llm-tools"
const CONTEXT_MARKER = "## my-local-llm-tools"

const SUMMARIES: Record<string, string> = {
  "image-analysis": "describe/compare images with local Ollama vision models",
  ocr: "extract text and structure from images/documents locally",
  autoskills: "analyze a project and propose skills, authored via ccreate-skill",
  "ccreate-skill": "create, update, and evaluate agent skills",
  "ccreate-agent": "create, optimize, and validate custom agents",
  "openai-api-usage": "call OpenAI and OpenAI-compatible APIs (llama.cpp, Ollama, vLLM)",
  setup: "detect dependencies, write the machine manifest, and diagnose the harness",
  "video-analysis": "describe and summarize local videos with minicpm frame sampling",
  speak: "text-to-speech in the system language via local piper-tts",
  "comfyui-server": "generate video/image/music/voice with local ComfyUI",
  "convert-files": "convert documents with local LibreOffice",
  "autoedit-with-gimp": "resize, convert, optimize, and edit images with GIMP",
  "autoedit-with-inkscape": "export, clean, edit, and vectorize SVG files",
  "image-background-removal": "remove image backgrounds locally with U2Net",
  "presentations-generator": "generate PPTX, HTML, and PDF presentations from JSON",
  "use-my-browser": "use an isolated persistent browser for extraction and downloads",
  "use-my-browser-learn": "learn and store browser selectors in SQLite",
  "use-my-browser-record": "record and replay browser workflows",
}

interface SkillMeta {
  id: string
  name: string
  description: string
}

interface LoadedSkill extends SkillMeta {
  path: string
  content: string
}

interface MachineManifest {
  generated_at: string
  hosts: { ollama: string; comfyui: string }
  ollama: { reachable: boolean }
  comfyui: { reachable: boolean }
  gpu: { ok: boolean; name: string; vram_gb: number }
  features: Record<string, { ok: boolean }>
}

type Machine =
  | { ok: true; path: string; manifest: MachineManifest }
  | { ok: false; path: string; error: string }

function setupCommand(root: string): string {
  return `node ${join(root, "src", "cli.mjs")} setup`
}

function loadMachine(): Machine {
  const path = manifestPath()
  try {
    return { ok: true, path, manifest: readManifest() as MachineManifest }
  } catch (error) {
    return { ok: false, path, error: error instanceof Error ? error.message : String(error) }
  }
}

function loadSkills(root: string): LoadedSkill[] {
  const { skills, warnings } = discoverSkills(root) as {
    skills: LoadedSkill[]
    warnings: string[]
  }
  for (const warning of warnings) console.warn(`[${HARNESS_ID}] ${warning}`)
  return skills.map((skill) => ({
    ...skill,
    content: renderSkillContent(skill.content, root, join(root, "skills", skill.id)),
  }))
}

function machineLines(machine: Machine, root: string): string[] {
  if (!machine.ok) {
    return [
      "WARNING: machine manifest missing or invalid — run setup before using local skills.",
      `  manifest: ${machine.path}`,
      `  command:  ${setupCommand(root)}`,
      '  (or "pnpm cli setup" from the repository root)',
      "",
    ]
  }
  const { manifest } = machine
  const lines = [
    `Machine profile (${machine.path}, generated ${manifest.generated_at}):`,
    `- Ollama ${manifest.hosts.ollama}: ${manifest.ollama.reachable ? "reachable" : "unreachable"}`,
    `- ComfyUI ${manifest.hosts.comfyui}: ${
      manifest.comfyui.reachable ? "reachable" : "unreachable"
    }`,
  ]
  if (manifest.gpu.ok) {
    lines.push(`- GPU ${manifest.gpu.name}: ${manifest.gpu.vram_gb} GiB`)
  }
  lines.push("")
  return lines
}

function readiness(machine: Machine, skillId: string): string {
  if (!machine.ok) return ""
  const feature = machine.manifest.features[skillId]
  if (!feature) return ""
  return feature.ok ? " — ready" : " — not ready"
}

function contextBlock(skills: LoadedSkill[], root: string, machine: Machine): string {
  const lines = [
    CONTEXT_MARKER,
    "",
    "Local-first, low-cost AI toolbelt. Machine facts come from the setup manifest.",
    "",
    ...machineLines(machine, root),
    `Bundled skills (root: ${join(root, "skills")}):`,
  ]
  for (const skill of skills) {
    const summary = SUMMARIES[skill.id] ?? "local tool"
    lines.push(`- ${HARNESS_ID}:${skill.id}: ${summary}${readiness(machine, skill.id)}`)
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
    const machine = loadMachine()

    if (!machine.ok) {
      console.warn(
        `[${HARNESS_ID}] machine manifest missing or invalid at ${machine.path} — ` +
          `run "${setupCommand(root)}" (${machine.error})`,
      )
    }

    await ctx.skill.transform((editor) => {
      for (const skill of skills) {
        editor.add({
          ...skill,
          id: `${HARNESS_ID}:${skill.id}`,
        } as Parameters<typeof editor.add>[0])
      }
    })

    const block = contextBlock(skills, root, machine)
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
