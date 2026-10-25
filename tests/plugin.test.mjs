import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import test from "node:test"

import plugin from "../index.ts"

function fakeContext() {
  const skills = []
  const hooks = {}
  return {
    skills,
    hooks,
    ctx: {
      skill: {
        transform: async (callback) => {
          callback({
            list: () => skills,
            get: () => undefined,
            add: (skill) => skills.push(skill),
            update: () => {},
            remove: () => {},
          })
        },
      },
      session: {
        hook: async (name, callback) => {
          hooks[name] = callback
        },
      },
    },
  }
}

test("plugin registers every skill with path and content", async () => {
  const { ctx, skills } = fakeContext()
  await plugin.setup(ctx)
  assert.equal(skills.length, 10)
  for (const skill of skills) {
    assert.ok(skill.id.startsWith("my-local-llm-tools:"), `${skill.id} prefix`)
    assert.ok(skill.path.endsWith("SKILL.md"), `${skill.id} path`)
    assert.ok(existsSync(skill.path), `${skill.id} file exists`)
    assert.ok(skill.content.length > 0, `${skill.id} content`)
    assert.ok(!skill.content.includes("${CLAUDE_PLUGIN_ROOT}"), `${skill.id} plugin root rendered`)
    assert.ok(!skill.content.includes("${CLAUDE_SKILL_DIR}"), `${skill.id} skill dir rendered`)
  }
})

test("context hook injects the inventory once", async () => {
  const { ctx, hooks } = fakeContext()
  await plugin.setup(ctx)
  const event = { system: [] }
  hooks.context(event)
  hooks.context(event)
  assert.equal(event.system.length, 1)
  assert.match(event.system[0].text, /## my-local-llm-tools/)
  assert.match(event.system[0].text, /my-local-llm-tools:image-analysis/)
})
