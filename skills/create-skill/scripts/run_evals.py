#!/usr/bin/env bash
# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""Run skill evaluation test cases with and without the skill.

Usage: uv run scripts/run_evals.py <evals.json> <skill_path> <workspace_dir> [--baseline]

evals.json format:
{
  "skill_name": "my-skill",
  "evals": [
    {
      "id": 1,
      "prompt": "user prompt text",
      "expected_output": "description of success",
      "files": ["evals/files/input.csv"],
      "assertions": ["output includes valid JSON"]
    }
  ]
}

Creates workspace structure:
  <workspace_dir>/
    iteration-N/
      eval-<name>/
        with_skill/outputs/
        without_skill/outputs/  (if --baseline)
        grading.json
      benchmark.json

Exit codes:
  0 - All evals completed
  2 - Usage error
"""

import json
import sys
import shutil
import time
from pathlib import Path
from datetime import datetime


def run_eval(prompt: str, input_files: list[str], output_dir: Path,
             skill_path: Path | None = None) -> dict:
    """Run a single eval prompt and capture outputs.

    Returns timing data and output file list.
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    # Copy input files to workspace
    for f in input_files:
        src = Path(f)
        if src.exists():
            shutil.copy2(src, output_dir / src.name)

    start = time.time()

    # TODO: Implement actual agent execution.
    # This depends on the agent client (opencode, claude code, etc.)
    # Example structure:
    #
    # env = os.environ.copy()
    # if skill_path:
    #     env["OPENCODE_SKILLS_DIR"] = str(skill_path.parent)
    #
    # result = subprocess.run(
    #     ["opencode", "--verbose", "-p", prompt],
    #     capture_output=True, text=True, timeout=300,
    #     env=env,
    #     cwd=output_dir
    # )
    #
    # Save outputs
    # (output_dir / "output.txt").write_text(result.stdout)
    # (output_dir / "stderr.txt").write_text(result.stderr)

    duration = time.time() - start

    return {
        "total_tokens": 0,  # TODO: Capture from agent
        "duration_ms": int(duration * 1000),
    }


def grade_assertions(assertions: list[str], output_dir: Path) -> dict:
    """Grade assertions against outputs in output_dir.

    Returns grading results with pass/fail and evidence.
    """
    results = []

    for assertion in assertions:
        # TODO: Implement actual assertion grading.
        # Use code-based checks where possible:
        # - File exists: Path(output_dir / "file.json").exists()
        # - Valid JSON: json.loads(content)
        # - Row count: len(csv.reader(content))
        # Use LLM grading for subjective assertions

        # Placeholder: mark as pending manual review
        results.append({
            "text": assertion,
            "passed": False,
            "evidence": "Not yet graded — run manual review or implement assertion check",
        })

    passed = sum(1 for r in results if r["passed"])
    return {
        "assertion_results": results,
        "summary": {
            "passed": passed,
            "failed": len(results) - passed,
            "total": len(results),
            "pass_rate": passed / len(results) if results else 0,
        },
    }


def main():
    if len(sys.argv) < 4:
        print("Usage: uv run scripts/run_evals.py <evals.json> <skill_path> <workspace_dir> [--baseline]", file=sys.stderr)
        print("", file=sys.stderr)
        print("evals.json:   Evaluation test cases", file=sys.stderr)
        print("skill_path:   Path to SKILL.md", file=sys.stderr)
        print("workspace_dir: Directory for eval results", file=sys.stderr)
        print("--baseline:   Also run without skill for comparison", file=sys.stderr)
        sys.exit(2)

    evals_file = Path(sys.argv[1])
    skill_path = Path(sys.argv[2])
    workspace_dir = Path(sys.argv[3])
    run_baseline = "--baseline" in sys.argv

    if not evals_file.exists():
        print(f"Error: file not found: {evals_file}", file=sys.stderr)
        sys.exit(2)

    with open(evals_file) as f:
        data = json.load(f)

    evals = data["evals"]
    skill_name = data.get("skill_name", "unknown")

    # Create iteration directory
    iteration = 1
    while (workspace_dir / f"iteration-{iteration}").exists():
        iteration += 1
    iter_dir = workspace_dir / f"iteration-{iteration}"
    iter_dir.mkdir(parents=True)

    benchmark = {
        "run_summary": {
            "with_skill": {"pass_rate": {"mean": 0}, "time_seconds": {"mean": 0}, "tokens": {"mean": 0}},
            "without_skill": {"pass_rate": {"mean": 0}, "time_seconds": {"mean": 0}, "tokens": {"mean": 0}},
            "delta": {"pass_rate": 0, "time_seconds": 0, "tokens": 0},
        }
    }

    with_skill_rates = []
    without_skill_rates = []
    with_skill_times = []
    without_skill_times = []
    with_skill_tokens = []
    without_skill_tokens = []

    for i, eval_case in enumerate(evals):
        eval_id = eval_case["id"]
        prompt = eval_case["prompt"]
        input_files = eval_case.get("files", [])
        assertions = eval_case.get("assertions", [])

        eval_dir = iter_dir / f"eval-{eval_id}"
        print(f"\nEval {i+1}/{len(evals)}: {prompt[:60]}...")

        # Run with skill
        with_dir = eval_dir / "with_skill" / "outputs"
        print(f"  Running with skill...", file=sys.stderr)
        timing = run_eval(prompt, input_files, with_dir, skill_path)
        (with_dir.parent / "timing.json").write_text(json.dumps(timing, indent=2))

        # Grade
        grading = grade_assertions(assertions, with_dir)
        (with_dir.parent / "grading.json").write_text(json.dumps(grading, indent=2))

        with_skill_rates.append(grading["summary"]["pass_rate"])
        with_skill_times.append(timing["duration_ms"] / 1000)
        with_skill_tokens.append(timing.get("total_tokens", 0))

        # Run baseline (without skill)
        if run_baseline:
            without_dir = eval_dir / "without_skill" / "outputs"
            print(f"  Running without skill (baseline)...", file=sys.stderr)
            timing_base = run_eval(prompt, input_files, without_dir, None)
            (without_dir.parent / "timing.json").write_text(json.dumps(timing_base, indent=2))

            grading_base = grade_assertions(assertions, without_dir)
            (without_dir.parent / "grading.json").write_text(json.dumps(grading_base, indent=2))

            without_skill_rates.append(grading_base["summary"]["pass_rate"])
            without_skill_times.append(timing_base["duration_ms"] / 1000)
            without_skill_tokens.append(timing_base.get("total_tokens", 0))

    # Compute benchmark
    if with_skill_rates:
        benchmark["run_summary"]["with_skill"]["pass_rate"]["mean"] = sum(with_skill_rates) / len(with_skill_rates)
        benchmark["run_summary"]["with_skill"]["time_seconds"]["mean"] = sum(with_skill_times) / len(with_skill_times)
        benchmark["run_summary"]["with_skill"]["tokens"]["mean"] = sum(with_skill_tokens) / len(with_skill_tokens)

    if without_skill_rates:
        benchmark["run_summary"]["without_skill"]["pass_rate"]["mean"] = sum(without_skill_rates) / len(without_skill_rates)
        benchmark["run_summary"]["without_skill"]["time_seconds"]["mean"] = sum(without_skill_times) / len(without_skill_times)
        benchmark["run_summary"]["without_skill"]["tokens"]["mean"] = sum(without_skill_tokens) / len(without_skill_tokens)

        benchmark["run_summary"]["delta"]["pass_rate"] = (
            benchmark["run_summary"]["with_skill"]["pass_rate"]["mean"] -
            benchmark["run_summary"]["without_skill"]["pass_rate"]["mean"]
        )
        benchmark["run_summary"]["delta"]["time_seconds"] = (
            benchmark["run_summary"]["with_skill"]["time_seconds"]["mean"] -
            benchmark["run_summary"]["without_skill"]["time_seconds"]["mean"]
        )
        benchmark["run_summary"]["delta"]["tokens"] = (
            benchmark["run_summary"]["with_skill"]["tokens"]["mean"] -
            benchmark["run_summary"]["without_skill"]["tokens"]["mean"]
        )

    # Save benchmark
    (iter_dir / "benchmark.json").write_text(json.dumps(benchmark, indent=2))

    print(f"\nIteration {iteration} complete. Results in: {iter_dir}")
    print(f"  With skill pass rate:    {benchmark['run_summary']['with_skill']['pass_rate']['mean']:.2f}")
    if run_baseline:
        print(f"  Without skill pass rate: {benchmark['run_summary']['without_skill']['pass_rate']['mean']:.2f}")
        print(f"  Delta:                   {benchmark['run_summary']['delta']['pass_rate']:+.2f}")

    sys.exit(0)


if __name__ == "__main__":
    main()
