import { homedir } from "node:os"
import { join } from "node:path"

const APP = ".mllt"

/** Per-user config and resource directory for this plugin. */
export function configDir(env = process.env, _platform = process.platform) {
  if (env.MY_LOCAL_LLM_TOOLS_CONFIG_DIR) return env.MY_LOCAL_LLM_TOOLS_CONFIG_DIR
  if (env.CHEAP_AI_CONFIG_DIR) return env.CHEAP_AI_CONFIG_DIR
  return join(homedir(), APP)
}

export function manifestPath(env = process.env, platform = process.platform) {
  return join(configDir(env, platform), "manifest.json")
}

export function factsPath(env = process.env, platform = process.platform) {
  return join(configDir(env, platform), "instance_facts.json")
}
