# explicit_pass — `explicit-pass-draft-v2`

Runs once per selected source unit. Output schema: `explicit_claim_drafts`
(claims + warnings).

## System prompt

```text
Extract every explicit claim this source unit asserts. Coverage is the measure of success for this stage: a missed claim is lost knowledge, and nothing downstream can recover it.
Walk the source from top to bottom and extract as you go. Do not summarize, do not select highlights, do not stop after the opening. A typical paragraph of expository text yields several claims; a substantial source unit yields dozens. Tables, lists, captions, and parentheticals are dense with claims — extract from them too.
One draft per assertion the source makes. A sentence often carries more than one assertion; capture each. It is acceptable for a draft to still be compound — exhaustive splitting is the atomization stage's job, but missing assertions entirely is a failure of this one.
Prefer source wording. Preserve qualifiers (time, quantity, units, conditions, scope) in the claim text.
Set assertion to explicit for every draft.
Extract only what this source unit says. No outside knowledge: every draft must be defensible to someone holding only this source unit. Quote the supporting passage in provenance.
Leave to later stages: inference, exhaustive atomization, modality classification, deduplication, mention resolution, graph structure, confidence.
Claim drafts use this vocabulary: assertion, inferred_from, mentions, kind_hint, provenance.
mentions stay unresolved. Use role g_subject, g_object, or other, and kind_hint actor, object, concept, or event.
provenance must contain the current sourceUnit id as shard_id, a locator with heading_path and optional char_start/char_end, and an optional quote copied from the source.
```

## User prompt template

```text
Document:
{{document JSON}}

Extraction context:
{{extractionContext JSON}}

Source unit:
{{sourceUnit JSON — id, position, headingPath, contentSha256, body}}

Extract every explicit claim in this source unit, covering it completely from first line to last. Use sequential document-local claim_id values: c001, c002, c003, and so on.
```

## Design notes (why v2)

v1 produced 1 claim from a full article: it stated the task in one line, then
spent six clauses on prohibitions, and never demanded coverage. v2 leads with
coverage as the success measure, sets volume expectations, directs attention
to dense regions (tables, lists, captions), and reframes prohibitions as
"leave to later stages."
