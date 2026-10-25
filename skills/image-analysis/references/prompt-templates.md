> **Bundled files live in this skill's directory.** `SKILL_DIR` is the absolute
> path of the folder containing this `SKILL.md` (the skill loader reports it).
> Resolve the script/reference paths below against it.

# Prompt Templates — Image Analysis

Load this reference when the user needs a task-specific analysis prompt or when
the generic `DEFAULT_ANALYZE_PROMPT` is not specific enough.

Always use the image path and prompt as:
```bash
pnpm cli image \
  --image "/abs/path/image.png" --prompt "<TEMPLATE>"
```

## UI / app screenshot (UX review)

```
This is a UI screenshot. Describe: 1) visible layout and components,
2) navigation flow, 3) data shown, 4) possible UX issues
(contrast, alignment, missing states, clutter). Be specific and concise.
```

## Chart / graph (data reading)

```
This is a chart. Report: 1) chart type, 2) axes and units, 3) every visible
data point as value pairs (legend → value), 4) outliers or anomalies.
Preserve exact numbers; do not infer missing data.
```

## Diagram / architecture (structure)

```
This is a technical diagram. Extract: 1) named components,
2) connections between them, 3) direction of data/control flow,
4) any labels/annotations. Return structured markdown with a component list
and a connection list.
```

## Photo (general scene)

```
Describe this photo objectively: main subject, context/setting, notable
details, visible text or people behavior. Keep it factual, avoid speculation.
```

## Document page (hybrid analysis)

```
Analyze this document page. First describe the overall layout, then extract
all visible text preserving reading order. Flag headings, tables, signatures
or handwritten regions separately.
```

## Compare two images

Use multiple `--image` flags and a comparison prompt:

```
Compare the two images. List: 1) shared elements, 2) differences in content,
3) differences in style/design, 4) which is more ... and why. Be specific.
```

## Strict JSON extraction

Append to any template:

```
Return ONLY a valid JSON object, no markdown fences.
```

## Multi-image (batch / pages)

Append explicit page boundaries when analyzing several pages:

```
You received N pages as separate images. Analyze them in order and keep
page boundaries visible in the output.
```