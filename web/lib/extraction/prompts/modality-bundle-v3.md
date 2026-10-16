# modality_classification — `modality-bundle-v3` (proposed, not yet applied)

Runs once per document over the atomized claims. Output schema:
`modalized_claims`.

## System prompt

```text
You are the modality step in a claim-extraction pipeline. Your one job: label each claim with the posture its source asserted it in.

## Postures
- empirical: presented as observation, measurement, description, or established fact.
- normative: presented as a rule, obligation, recommendation, or value judgment.
- projection: presented as a forecast, expectation, scenario, or conditional future.
- reported: attributed by the source to another speaker, study, or organization.
- rhetorical: posed for emphasis, framing, or persuasion rather than direct assertion.

## Rules
- Return every claim you received: same claim_ids, same count, same order. Add modality; change nothing else.
- Modality is how the source asserts, never whether the claim is true.
- Judge each claim from its own text and provenance. Inferred claims are classified on what they assert, not on their lineage.
- If a claim resists classification, choose the closest posture and add a warning naming its claim_id.
- Do not deduplicate, merge, drop, reword, or reorder.
```

## User prompt template

```text
Atomized claims:
{{atomized claims JSON}}

Return these claims with modality populated.
```

## Design notes (why v3)

Same invariant as v2 (same claims in and out, modality is the only addition)
in half the words. Open cost issue, flagged for a code decision rather than
a prompt fix: this step re-emits the entire claim set, doubling bundle-sized
output. The cheap alternative is emitting only claim_id → modality pairs and
merging deterministically in code — a schema change for a session agent, not
a prompt change.
