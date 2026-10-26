---
name: ccreate-agent
description: >
  Use this skill when creating, optimizing, or validating custom agents —
  write agent definition files with valid frontmatter, clear tool boundaries,
  trigger-aware descriptions, and completion checks so the agent is usable
  immediately. Also use when improving an agent profile, tightening tool
  permissions, refining a workflow, or debugging why an agent is not selected,
  including "create an agent for X" or "my agent is ignored" — ask clarifying
  questions if scope is ambiguous.
---

## Agent naming rules

- Use lowercase alphanumeric plus hyphens
- Keep names concise and action-oriented
- Match file and frontmatter naming conventions used by the workspace
- Preserve existing names unless the user asks to rename

## Expected locations

Create agent files in workspace-conventional locations first, then confirm with the user if multiple valid paths exist.

- Global-scoped: `~/.agents/agents/<name>.md`
- Project-scoped: `${projectRoot}/agents/<name>.md`

## Frontmatter template

Every agent file should include clear frontmatter fields used by the host platform.

```yaml
---
name: <agent-name>
description: >
  <when this agent should be used, with trigger phrases and intent>
---
```

Description guidance:

- Make the intent explicit: what user request should route here
- Include realistic trigger phrases and neighboring use cases
- Add boundaries to avoid accidental over-triggering

## Creation workflow

1. Confirm objective and scope
2. Choose target path (workspace vs user profile)
3. Draft frontmatter with a trigger-focused description
4. Define workflow steps and decision points
5. Set tool boundaries (default-safe, task-appropriate)
6. Add completion checks and validation criteria
7. Save file and run a quick consistency review

## Decision points

- If requests are broad and policy-like, prefer instructions over custom agents
- If one focused command is enough, prefer prompt files over agents
- If behavior should run on demand with assets, prefer skills over agents
- If external system integration is required, consider MCP or hooks

## Quality checks

- Frontmatter parses correctly and includes a meaningful description
- Description is specific enough to trigger for intended requests
- Steps are executable, ordered, and testable
- Tool access is least-privilege for the intended workflow
- Agent output criteria are explicit (what "done" means)

## Iteration loop

1. Draft or update the agent file
2. Review weak or ambiguous sections
3. Ask targeted follow-up questions
4. Refine and re-check until behavior is stable

## Suggested follow-up prompts

- "Create an agent for API incident triage with read-only defaults"
- "Tighten tool permissions for my deployment agent"
- "Debug why my custom agent is not being selected"