import { evals } from "./skill/evals.mjs"
import { triggers } from "./skill/triggers.mjs"
import { validate } from "./skill/validate.mjs"

const USAGE = `Usage: node src/cli.mjs skill <action> [args...]

Actions:
  validate <SKILL.md>
  triggers <queries.json> <skill> [runs]
  evals <evals.json> <SKILL.md> <workspace> [--baseline]
`

export async function skill(argv) {
  const [action, ...args] = argv
  switch (action) {
    case "validate":
      return validate(args)
    case "triggers":
      return triggers(args)
    case "evals":
      return evals(args)
    default:
      process.stderr.write(USAGE)
      return 2
  }
}
