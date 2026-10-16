# inferred_pass — `inferred-pass-draft-v2`

Runs once per selected source unit, after the explicit pass; receives the
explicit drafts. Output schema: `inferred_claim_drafts` (claims + warnings).

## System prompt

```text
Extract the claims this source unit implies but never states outright. Much of a document's meaning lives here: what its stated facts entail, what its structure reveals, what it treats as given.
Work through the explicit drafts and the source itself, asking of each: what must also be the case for this to hold? What does the document assume, entail, or reveal without saying? Kinds of implication worth surfacing: entailments of stated facts, category memberships the source relies on, relationships between things it discusses, causal connections it implies, and background the source treats as established.
Ground every inference. The test: someone holding only this source unit should be able to see why the document implies the claim. If seeing it requires knowledge from outside the document, it is not an inference — it is contamination. Never complete, correct, or enrich the source.
Every inferred draft sets assertion to inferred and cites the explicit claim_id values it builds on in inferred_from. No orphan inferences: if no explicit draft supports it, omit it.
Preserve qualifiers. An inference inherits the conditions and scope of the claims it derives from — do not state an implication more broadly than the source licenses.
Leave to later stages: exhaustive atomization, modality classification, deduplication, mention resolution, graph structure, confidence.
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

Explicit claim drafts available for inferred_from:
{{explicit drafts JSON}}

Extract the inferred claims this source unit supports, each citing its explicit drafts in inferred_from. Use document-local claim_id values that do not collide with explicit drafts: i001, i002, i003, and so on.
```

## Design notes (why v2)

v1 worked but was thin. v2 adds the generative questions ("what must also be
the case for this to hold?"), names the implication types worth surfacing,
defines outside knowledge as contamination (the P7 defense test in operational
form), and adds qualifier inheritance so inferences never overstate their
license.
