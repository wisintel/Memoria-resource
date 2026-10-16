## Task

Extract subject candidates from the provided Memoria document context.

Return only JSON with this shape:

```json
{
  "subjects": [
    {
      "localSubjectId": "subject_001",
      "label": "Subject label",
      "type": "concept",
      "aliases": ["Optional alias"],
      "description": "Short neutral description.",
      "rationale": "Why this should be reviewed as a subject.",
      "evidenceRefs": [
        {
          "sourceUnitId": "source unit id",
          "evidenceText": "Short supporting excerpt"
        }
      ]
    }
  ]
}
```

Rules:
- Prefer concrete actors, artifacts, concepts, systems, operations, phases, products, and methods.
- Do not create canonical graph records.
- Use only the provided context.
- Keep labels concise.
- Use stable local ids in the form `subject_001`, `subject_002`, and so on.
- Include evidence references when the source unit supports the candidate.
- If no subject candidates are supported, return `{ "subjects": [] }`.
