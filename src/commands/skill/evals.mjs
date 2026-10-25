import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { basename, join } from "node:path"

const USAGE = `Usage: node src/cli.mjs skill evals <evals.json> <SKILL.md> <workspace_dir> [--baseline]

evals.json:    Evaluation test cases
SKILL.md:      Path to the skill file
workspace_dir: Directory for eval results
--baseline:    Also run without the skill for comparison
`

function mean(values) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0
}

function runEval(prompt, inputFiles, outputDir) {
  mkdirSync(outputDir, { recursive: true })
  for (const file of inputFiles) {
    if (existsSync(file)) copyFileSync(file, join(outputDir, basename(file)))
  }
  const start = Date.now()
  // Agent execution is client-specific; wire it here and write stdout/stderr
  // into outputDir, then return real token usage.
  return { total_tokens: 0, duration_ms: Date.now() - start, prompt }
}

function gradeAssertions(assertions) {
  const results = assertions.map((assertion) => ({
    text: assertion,
    passed: false,
    evidence: "Not yet graded — run manual review or implement assertion check",
  }))
  const passed = results.filter((result) => result.passed).length
  return {
    assertion_results: results,
    summary: {
      passed,
      failed: results.length - passed,
      total: results.length,
      pass_rate: results.length ? passed / results.length : 0,
    },
  }
}

function nextIteration(workspaceDir) {
  let iteration = 1
  while (existsSync(join(workspaceDir, `iteration-${iteration}`))) iteration += 1
  return { iteration, dir: join(workspaceDir, `iteration-${iteration}`) }
}

export function evals(argv) {
  if (argv.length < 3) {
    process.stderr.write(USAGE)
    return 2
  }
  const [evalsFile, , workspaceDir] = argv
  const runBaseline = argv.includes("--baseline")

  if (!existsSync(evalsFile)) {
    process.stderr.write(`Error: file not found: ${evalsFile}\n`)
    return 2
  }

  let data
  try {
    data = JSON.parse(readFileSync(evalsFile, "utf8"))
  } catch (error) {
    process.stderr.write(`Error: invalid JSON in ${evalsFile}: ${error.message}\n`)
    return 2
  }

  const cases = data.evals ?? []
  const { iteration, dir: iterDir } = nextIteration(workspaceDir)
  mkdirSync(iterDir, { recursive: true })

  const benchmark = {
    run_summary: {
      with_skill: { pass_rate: { mean: 0 }, time_seconds: { mean: 0 }, tokens: { mean: 0 } },
      without_skill: { pass_rate: { mean: 0 }, time_seconds: { mean: 0 }, tokens: { mean: 0 } },
      delta: { pass_rate: 0, time_seconds: 0, tokens: 0 },
    },
  }
  const runs = {
    with_skill: { rates: [], times: [], tokens: [] },
    without_skill: { rates: [], times: [], tokens: [] },
  }

  cases.forEach((evalCase, index) => {
    const prompt = evalCase.prompt
    console.log(`\nEval ${index + 1}/${cases.length}: ${prompt.slice(0, 60)}...`)
    const evalDir = join(iterDir, `eval-${evalCase.id}`)

    for (const variant of runBaseline ? ["with_skill", "without_skill"] : ["with_skill"]) {
      const outputDir = join(evalDir, variant, "outputs")
      process.stderr.write(`  Running ${variant}...\n`)
      const timing = runEval(prompt, evalCase.files ?? [], outputDir)
      writeFileSync(join(evalDir, variant, "timing.json"), JSON.stringify(timing, null, 2))

      const grading = gradeAssertions(evalCase.assertions ?? [])
      writeFileSync(join(evalDir, variant, "grading.json"), JSON.stringify(grading, null, 2))

      runs[variant].rates.push(grading.summary.pass_rate)
      runs[variant].times.push(timing.duration_ms / 1000)
      runs[variant].tokens.push(timing.total_tokens ?? 0)
    }
  })

  for (const variant of ["with_skill", "without_skill"]) {
    const summary = benchmark.run_summary[variant]
    summary.pass_rate.mean = mean(runs[variant].rates)
    summary.time_seconds.mean = mean(runs[variant].times)
    summary.tokens.mean = mean(runs[variant].tokens)
  }
  if (runBaseline) {
    const delta = benchmark.run_summary.delta
    for (const key of ["pass_rate", "time_seconds", "tokens"]) {
      delta[key] =
        benchmark.run_summary.with_skill[key].mean - benchmark.run_summary.without_skill[key].mean
    }
  }

  writeFileSync(join(iterDir, "benchmark.json"), JSON.stringify(benchmark, null, 2))
  console.log(`\nIteration ${iteration} complete. Results in: ${iterDir}`)
  console.log(
    `  With skill pass rate:    ${benchmark.run_summary.with_skill.pass_rate.mean.toFixed(2)}`,
  )
  if (runBaseline) {
    console.log(
      `  Without skill pass rate: ${benchmark.run_summary.without_skill.pass_rate.mean.toFixed(2)}`,
    )
    console.log(`  Delta:                   ${benchmark.run_summary.delta.pass_rate.toFixed(2)}`)
  }
  return 0
}
