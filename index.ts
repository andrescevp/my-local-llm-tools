// my-local-llm-tools — OpenCode V2 plugin.
//
// Registers the bundled skills (skills/*/SKILL.md, metadata from
// skills/manifest.json) and injects a compact inventory into every session.
// Machine facts (endpoints, readiness) are read from the manifest written by
// `setup`; nothing about the host is hardcoded here.

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { Plugin } from "@opencode/plugin"

import { manifestPath, readManifest } from "./src/commands/setup/manifest.mjs"

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
