# Evaluating Skill Output Quality

Test whether a skill produces good outputs by running evaluation test cases with and without the skill.

## 1. Design test cases

Store in `evals/evals.json`:

```json
{
  "skill_name": "<name>",
  "evals": [
    {
      "id": 1,
      "prompt": "realistic user message with context, file paths, specifics",
      "expected_output": "human-readable description of success",
      "files": ["evals/files/input.csv"],
      "assertions": [
        "The output includes a valid JSON file",
        "The report has at least 3 sections",
        "No PII appears in the output"
      ]
    }
  ]
}
```

Start with 2-3 test cases. Vary phrasing, cover edge cases, use realistic context.

## 2. Run with and without the skill

For each test case, run twice:

- **With skill**: agent has access to `SKILL.md`
- **Without skill** (baseline): same prompt, no skill

Save outputs to separate directories per iteration:

```
workspace/
  iteration-1/
    eval-<name>/
      with_skill/outputs/
      without_skill/outputs/
      grading.json
    benchmark.json
```

## 3. Write assertions and grade

After seeing first outputs, add assertions that are:

- Programmatically verifiable (valid JSON, file exists, row count)
- Specific and observable (chart has labeled axes)
- Countable (at least 3 recommendations)

Avoid vague assertions ("output is good") or overly brittle ones ("exact phrase match").

Grade each assertion as PASS/FAIL with concrete evidence in `grading.json`.

## 4. Aggregate and analyze

Compute `benchmark.json` with pass rates, time, and tokens for both configurations:

```json
{
  "run_summary": {
    "with_skill": { "pass_rate": { "mean": 0.83 } },
    "without_skill": { "pass_rate": { "mean": 0.33 } },
    "delta": { "pass_rate": 0.50 }
  }
}
```

Investigate patterns: assertions that always pass in both (remove them), assertions that always fail in both (fix or remove), assertions that pass with skill but fail without (skill is adding value).

## 5. Human review

Review actual outputs alongside grades. Record specific feedback: "missing axis labels" is actionable, "looks bad" is not.

## 6. Iterate

Use failed assertions, human feedback, and execution transcripts to improve the skill. Give all three signals plus current `SKILL.md` to an LLM to propose changes. Rerun in a new iteration directory.

Stop when feedback is consistently empty or no meaningful improvement between iterations.
