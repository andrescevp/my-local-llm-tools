> **Bundled files live in this skill's directory.** `SKILL_DIR` is the absolute
> path of the folder containing this `SKILL.md` (the skill loader reports it).
> Resolve the script/reference paths below against it.

# OCR Prompt Templates

Use these prompts with `$SKILL_DIR/scripts/ocr_ollama.py --prompt "..."`.

## 1) Generic document OCR

```text
Extract all visible text from the image. Preserve headings, lists, and paragraph order. Return markdown. Mark uncertain words as [uncertain].
```

## 2) Chart parsing

```text
Read this chart and return:
1) chart title,
2) legend items,
3) each metric/value pair with units or percentages,
4) short notes for ambiguous labels.
Output as markdown table.
```

## 3) Table extraction

```text
Extract the table row-by-row. Keep column order exactly as shown. If a cell is unreadable, set value to [uncertain]. Return markdown table.
```

## 4) Technical diagram

```text
Extract all labels, annotations, and callouts from the diagram. Group by region/component if possible. Return markdown sections with bullet points.
```

## 5) Invoice / form

```text
Extract key fields: document title, vendor, date, invoice number, line items, subtotal, taxes, total. Return JSON with stable keys and include [uncertain] markers when needed.
```
