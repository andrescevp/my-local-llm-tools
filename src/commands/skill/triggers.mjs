import { existsSync, mkdirSync, readFileSync } from "node:fs"

const USAGE = `Usage: node src/cli.mjs skill triggers <queries.json> <skill_name> [runs]

queries.json: Array of {query, should_trigger} objects
skill_name:   Name of the skill to test
runs:         Number of runs per query (default: 3)
`

// Detection depends on the agent client. Wire the client invocation here and
// return true when the skill was loaded for this query.
function checkTriggered(_query, _skillName, _workspaceDir) {
  return false
}

export function triggers(argv) {
  if (argv.length < 2) {
    process.stderr.write(USAGE)
    return 2
  }
  const [queriesFile, skillName, runsArg] = argv
  const runs = Number.parseInt(runsArg ?? "3", 10) || 3

  if (!existsSync(queriesFile)) {
    process.stderr.write(`Error: file not found: ${queriesFile}\n`)
    return 2
  }

  let queries
  try {
    queries = JSON.parse(readFileSync(queriesFile, "utf8"))
  } catch (error) {
    process.stderr.write(`Error: invalid JSON in ${queriesFile}: ${error.message}\n`)
    return 2
  }

  const workspace = `trigger_eval_${skillName}`
  mkdirSync(workspace, { recursive: true })

  const results = []
  queries.forEach((item, index) => {
    const query = item.query
    const shouldTrigger = Boolean(item.should_trigger)
    let hits = 0

    process.stderr.write(`Query ${index + 1}/${queries.length}: ${query.slice(0, 60)}...\n`)
    for (let run = 1; run <= runs; run += 1) {
      process.stderr.write(`  Run ${run}/${runs}...\n`)
      if (checkTriggered(query, skillName, workspace)) hits += 1
    }

    const triggerRate = hits / runs
    const passed = shouldTrigger ? triggerRate > 0.5 : triggerRate < 0.5
    results.push({
      query,
      should_trigger: shouldTrigger,
      triggers: hits,
      runs,
      trigger_rate: triggerRate,
      passed,
    })
  })

  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`)
  const passed = results.filter((result) => result.passed).length
  process.stderr.write(`\n${passed}/${results.length} queries passed\n`)
  return passed === results.length ? 0 : 1
}
