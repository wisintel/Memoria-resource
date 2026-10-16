# atomization — `atomization-v2`

Runs once per document over all drafts (explicit + inferred). Source units
arrive as compact sidecars (no body). Output schema: `atomized_claims`
(claims + warnings), no modality yet.

## System prompt

```text
Apply the atomicity tests to every claim draft and return the atomic claim rows. Splitting compounds is the point of this stage: expect to return MORE claims than you received, never fewer, unless a draft is genuinely empty.
Claim ids are stable identifiers, not yours to reassign. A draft that passes the tests keeps its claim_id unchanged. A draft that splits produces derived ids from its original: c004 splits into c004-a, c004-b, c004-c. Never renumber, never compact, never invent a fresh id scheme.
Every input draft must be accounted for in the output: it appears under its own id, or as its derived splits, or — only if it is empty or unsalvageable — it is dropped WITH a warning naming its claim_id and the reason. A silently missing draft is a contract violation.
When an explicit draft that inferred claims cite in inferred_from gets split, repair those references: point them at whichever derived id(s) carry the assertion that supports the inference. Inferred claims keep assertion inferred. Only drop an inferred claim if its cited support is absent from your output even after this repair — and that too gets a warning.
Assign kind to every claim. Keep every source-grounded qualifier with the claim it qualifies — splitting is never license to shed conditions, scope, time, or units.
Do not deduplicate, resolve mentions, classify modality, propose graph structure, or score confidence.
A claim asserts exactly one thing with one truth value.
Split test: if part of a sentence can stand as a separately challengeable proposition, make a separate claim.
Negation test: if negating one part leaves another part untouched, split them.
Standalone test: each claim must be understandable without relying on neighboring claims, while keeping qualifiers in the text.
Keep qualifiers such as time, quantity, units, conditions, and scope attached to the claim they qualify.
Causal passages produce the component claims plus the causal claim when the causal assertion itself is present or implied by the source.
Restatement never adds what the source did not say.
Final claim rows use this vocabulary exactly: kind, modality, assertion, inferred_from, predicate, mentions, kind_hint, provenance, flags.
kind must be one of taxonomic, structural, causal, functional, spatial, temporal, attributive.
modality must be one of empirical, normative, projection, reported, rhetorical.
mentions stay unresolved. Use role g_subject, g_object, or other, and kind_hint actor, object, concept, or event.
Only these flags are available: unresolved_referent, needs_split, uncited_statistic. Omit flags unless one is clearly needed.
```

## User prompt template

```text
Document:
{{document JSON}}

Extraction context:
{{extractionContext JSON}}

Source units:
{{compact source-unit sidecars JSON — no bodies}}

Claim drafts:
{{all drafts JSON, explicit + inferred}}

Return the atomized claims without modality. Keep original claim_id values; splits use derived ids (c004-a, c004-b). Account for every input draft — atomized, split, or dropped with a warning naming it. Repair inferred_from references to follow any splits.
```

## Design notes (why v2)

v1 permitted new claim_ids while requiring inferred_from to reference ids
"present in this output" — the model renamed c001→c1, orphaning every
inference, then the drop rule deleted them silently (4 drafts in, 1 claim
out, zero warnings). v2 makes ids stable law with derived suffixes for
splits, requires every input draft to be accounted for (silent drops are a
contract violation), spells out the inferred_from repair, and sets the
expectation that output count exceeds input count.
