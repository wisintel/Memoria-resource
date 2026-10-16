---
name: document-inspection
description: Use when a document needs a Document Profile before extraction — inspect its prepared source to classify shape, source form, structure to preserve, and capture posture, then persist it. Produces guidance for extraction, not evidence.
---

# Document Inspection

Produce a Document Profile: per-document guidance for extraction — what the document is, how it's shaped, what structure must survive, and how to capture it. Guidance, not evidence. One per document, regenerable.

## When to run

Before extracting a document, when it has no Document Profile or the profile is stale.

## How to inspect

1. Read the document with `get_document_context` — its source units carry the text, heading paths, and unit types.
2. Judge shape and extraction posture from the source itself. Treat container facts (filename, source form) as given by metadata; treat the text as the evidence for shape and structure.
3. Prefer hints over overconfident claims. Use low `confidence` or `unknown` when the source is mixed or unclear. Do not paraphrase structure away while inspecting.
4. Flag extraction damage — broken reading order, OCR noise, suspicious merges — that would hurt downstream capture.
5. Keep it compact: this is operating context handed to extraction, not a summary.

## What to capture

- `documentShape` — procedure, reference, policy, architecture note, meeting notes, report, tabular, slides, mixed, unknown…
- `sourceForm` — pdf_export, scanned_pdf, native_markdown, docx_export, slide_export, spreadsheet_export, web_capture…
- `summary` — one line on what the document is.
- `structureFlags` — meaning-bearing structure to preserve verbatim: tables, ordered steps, code blocks, config examples, diagrams, version-sensitive sections.
- `captureProfileHint` — how to extract this document: which subject archetypes and what fidelity to expect from the source.
- `domainHint` — likely subject area, as a cross-check against the active domain. Flag a mismatch rather than forcing a fit.
- `handlingFlags` — extraction risks: broken_reading_order, ocr_noise, header_footer_repetition, table_dense, mixed_content, needs_manual_review…
- `ambiguityNotes`, `errorSummary`.

## Output and persistence

Compile the profile and save it with `save_document_profile` (keyed by document id). The keys match the persistence contract:

```json
{
  "inspectionStatus": "ready",
  "confidence": "medium",
  "documentShape": "",
  "sourceForm": "",
  "summary": "",
  "captureProfileHint": "",
  "domainHint": "",
  "structureFlags": [],
  "handlingFlags": [],
  "ambiguityNotes": [],
  "errorSummary": null
}
```

- `inspectionStatus` is exactly `ready` or `inspection_failed`. Use `inspection_failed` with a short `errorSummary` if the document can't be read or judged.
- `confidence` is exactly one of `high`, `medium`, `low`, `unknown`.

Saving a profile is an operational-guidance write, not a canonical-memory mutation, so it does not need the canonical approval gate. Do not claim it was saved unless `save_document_profile` confirms it.
