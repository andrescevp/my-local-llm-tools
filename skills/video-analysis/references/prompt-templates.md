# Frame prompt templates

Use with `video --input PATH --prompt "..."`; keep one instruction per run so
frame descriptions stay comparable.

## General understanding

> Describe this video frame in detail: subjects, actions, setting, on-screen
> text, and any notable changes. Be concise and objective.

## People and actions

> Describe the people, their apparent actions, interactions, and posture. Note
> clothing, objects in hand, and the setting. Do not infer identity or intent.

## Surveillance / incident review

> Describe what is visible: people, vehicles, objects, movement direction, and
> time/date overlays. Distinguish clearly visible facts from uncertainty.

## Screen recording / UI walkthrough

> Describe the application screen: visible window, page, controls, labels, and
> the apparent user action. Transcribe short labels; defer long text to OCR.

## Slides, documents, and tables

> Describe the layout and note whether the frame is a document, slide, or table.
> Transcribe headings only; mark dense text for OCR follow-up.

## Sports or physical activity

> Describe the activity, participants, equipment, field/court position, and the
> phase of the action (setup, execution, result).

## Safety / hazard check

> Identify visible hazards, PPE, barriers, signage, and people at risk. State
> only what is visible; mark occluded areas as unknown.

## Summary pass

The `--summary` flag sends all frame descriptions with:

> Summarize this video from its frame descriptions. Give a chronological
> summary, the main subjects and actions, and any visible text. Be concise.
