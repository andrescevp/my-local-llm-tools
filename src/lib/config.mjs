import { homedir } from "node:os"
import { join } from "node:path"

const APP = "my-local-llm-tools"

/** Per-user config directory (Windows/macOS/Linux). */
export function configDir(env = process.env, platform = process.platform) {
  if (env.MY_LOCAL_LLM_TOOLS_CONFIG_DIR) return env.MY_LOCAL_LLM_TOOLS_CONFIG_DIR
  if (env.CHEAP_AI_CONFIG_DIR) return env.CHEAP_AI_CONFIG_DIR
  if (platform === "win32") {
    return join(env.APPDATA ?? join(homedir(), "AppData", "Roaming"), APP)
  }
  if (platform === "darwin") {
    return join(homedir(), "Library", "Application Support", APP)
  }
  return join(env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), APP)
}

export function manifestPath(env = process.env, platform = process.platform) {
  return join(configDir(env, platform), "manifest.json")
}

export function factsPath(env = process.env, platform = process.platform) {
  return join(configDir(env, platform), "instance_facts.json")
}
