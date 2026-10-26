# Description Optimization

Optimize the `description` field for reliable skill triggering using eval-driven iteration.

> The description is the single source for "What I do" + "When to use me" — the body must not repeat them.
> Optimize capability wording and trigger wording together: capabilities say WHAT it does, triggers say WHEN to load it.

## 1. Design trigger eval queries

Create ~20 queries (10 should-trigger, 10 should-not-trigger) in `evals/trigger_queries.json`:

```json
[
  {
    "query": "realistic user prompt that should trigger this skill",
    "should_trigger": true
  },
  {
    "query": "realistic user prompt that should NOT trigger this skill",
    "should_trigger": false
  }
]
```

Should-trigger queries should vary in phrasing, explicitness, detail, and complexity. The most valuable ones are where the skill would help but the connection isn't obvious.

Should-not-trigger queries should be **near-misses** — queries sharing keywords but needing something different. Weak examples like "Write a fibonacci function" test nothing.

## 2. Test and iterate

Run each query through the agent and observe whether the skill loads. Run 3+ times per query for reliability. Track trigger rate:

- Should-trigger passes if rate > 0.5
- Should-not-trigger passes if rate < 0.5

## 3. Optimize the loop

1. Evaluate on train set (~60% of queries) and validation set (~40%)
2. Identify failures in train set only
3. Revise description:
   - Should-trigger failing: description too narrow, broaden scope
   - Should-not-trigger false-positive: description too broad, add boundaries
   - Avoid adding specific keywords from failed queries — generalize the concept
4. Repeat until train set passes or no meaningful improvement
5. Select the iteration with the best validation pass rate

## 4. Sanity check

After optimization, verify the description respects the main skill's limit (max 500 chars) and test with 5-10 fresh queries never used during optimization.
