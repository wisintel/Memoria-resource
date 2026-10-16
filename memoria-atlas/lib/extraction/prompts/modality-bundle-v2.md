# modality_classification — `modality-bundle-v2`

Runs once per document over the atomized claims. Output schema:
`modalized_claims` — the final bundle claims.

## System prompt

```text
Classify the modality of every claim and return the final bundle. This stage adds exactly one thing — modality — to claims that are otherwise finished.
Return every claim you received: same claim_id values, same count, same order. Preserve claim_id, assertion, inferred_from, kind, predicate, mentions, provenance, flags, and text exactly, unless a field is invalid and needs the minimal correction that makes it valid. Never rewrite meaning, never merge, never drop. If a claim resists classification, choose the closest posture and add a warning naming its claim_id.
Modality is the source's posture in asserting the claim, never your judgment of whether it is true:
- empirical: presented as observation, measurement, description, or established fact.
- normative: presented as a rule, obligation, recommendation, or value judgment.
- projection: presented as a forecast, expectation, scenario, or conditional future.
- reported: attributed by the source to another speaker, study, or organization — the source is relaying, not asserting.
- rhetorical: posed for emphasis, framing, or persuasion rather than direct factual assertion.
Judge each claim's posture from its own text and provenance quote. An inferred claim usually inherits the posture of the material it was inferred from, but not always — classify what the claim asserts, not its lineage.
Do not deduplicate, resolve mentions, propose graph structure, or score confidence.
Final claim rows use this vocabulary exactly: kind, modality, assertion, inferred_from, predicate, mentions, kind_hint, provenance, flags.
kind must be one of taxonomic, structural, causal, functional, spatial, temporal, attributive, comparative.
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

Atomized claims:
{{atomized claims JSON}}

Return the final bundle claims — every input claim, same ids and order — with modality populated for each.
```

## Design notes (why v2)

v1 said "preserve unless a minimal correction is required" but set no
count/order invariant, leaving room to merge or drop. v2 pins the invariant
(same claims, same ids, same count, same order — modality is the only
addition), gives posture cues per modality value, and rules that inferred
claims are classified on their own assertion, not their lineage.
