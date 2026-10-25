#!/usr/bin/env bash
# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""Test skill description trigger rates against eval queries.

Usage: uv run scripts/test_triggers.py <queries.json> <skill_name> [runs]

queries.json format:
[
  {"query": "user prompt text", "should_trigger": true},
  {"query": "another prompt", "should_trigger": false}
]

Outputs JSON results to stdout with trigger rates per query.

Exit codes:
  0 - All queries passed
  1 - Some queries failed
  2 - Usage error
"""

import json
import sys
import subprocess
import os
from pathlib import Path


def check_triggered(query: str, skill_name: str, workspace_dir: str) -> bool:
    """Run a query through opencode and check if the skill was loaded.

    This detection logic depends on the agent client. For opencode,
    check the skill loading behavior in verbose output or logs.

    Replace this implementation with detection logic appropriate for
    your agent client.
    """
    # TODO: Implement actual trigger detection based on agent client.
    # Example approach for clients that log skill loading:
    # result = subprocess.run(
    #     ["opencode", "--verbose", "-p", query],
    #     capture_output=True, text=True, timeout=120,
    #     env={**os.environ, "OPENCODE_SKILLS_DIR": workspace_dir}
    # )
    # return skill_name in result.stderr or skill_name in result.stdout

    # Placeholder: skill not detected
    return False


def main():
    if len(sys.argv) < 3:
        print("Usage: uv run scripts/test_triggers.py <queries.json> <skill_name> [runs]", file=sys.stderr)
        print("", file=sys.stderr)
        print("queries.json: Array of {query, should_trigger} objects", file=sys.stderr)
        print("skill_name:   Name of the skill to test", file=sys.stderr)
        print("runs:         Number of runs per query (default: 3)", file=sys.stderr)
        sys.exit(2)

    queries_file = Path(sys.argv[1])
    skill_name = sys.argv[2]
    runs = int(sys.argv[3]) if len(sys.argv) > 3 else 3

    if not queries_file.exists():
        print(f"Error: file not found: {queries_file}", file=sys.stderr)
        sys.exit(2)

    with open(queries_file) as f:
        queries = json.load(f)

    # Create workspace directory for this run
    workspace = Path(f"trigger_eval_{skill_name}")
    workspace.mkdir(exist_ok=True)

    results = []
    for i, item in enumerate(queries):
        query = item["query"]
        should_trigger = item["should_trigger"]
        triggers = 0

        print(f"Query {i+1}/{len(queries)}: {query[:60]}...", file=sys.stderr)

        for run in range(1, runs + 1):
            print(f"  Run {run}/{runs}...", file=sys.stderr)
            if check_triggered(query, skill_name, str(workspace)):
                triggers += 1

        trigger_rate = triggers / runs
        passed = (should_trigger and trigger_rate > 0.5) or (not should_trigger and trigger_rate < 0.5)

        result = {
            "query": query,
            "should_trigger": should_trigger,
            "triggers": triggers,
            "runs": runs,
            "trigger_rate": trigger_rate,
            "passed": passed,
        }
        results.append(result)

    # Output results
    print(json.dumps(results, indent=2))

    # Summary
    passed = sum(1 for r in results if r["passed"])
    total = len(results)
    print(f"\n{passed}/{total} queries passed", file=sys.stderr)

    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    main()
