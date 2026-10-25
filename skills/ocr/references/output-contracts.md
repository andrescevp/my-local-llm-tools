> **Bundled files live in this skill's directory.** `SKILL_DIR` is the absolute
> path of the folder containing this `SKILL.md` (the skill loader reports it).
> Resolve the script/reference paths below against it.

# OCR Output Contracts

Use these schemas when the user requests structured extraction.

## Minimal JSON contract

```json
{
  "title": "string",
  "content_markdown": "string",
  "uncertain_segments": [
    { "text": "string", "reason": "low-resolution|occlusion|blur|rotation" }
  ]
}
```

## Chart JSON contract

```json
{
  "title": "string",
  "legend": ["string"],
  "metrics": [
    {
      "label": "string",
      "value": "number|string",
      "unit": "string",
      "source": "slice-label|axis|legend|annotation",
      "uncertain": false
    }
  ],
  "notes": ["string"]
}
```

## Table JSON contract

```json
{
  "title": "string",
  "columns": ["string"],
  "rows": [["string"]],
  "uncertain_cells": [
    { "row": 0, "column": "string", "raw": "string" }
  ]
}
```
