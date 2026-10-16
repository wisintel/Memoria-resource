# Extraction Guidance

Extract atomic claim bundles from prepared document source units.

Output only extraction-bundle claim data. Do not propose graph structure, resolve mentions, deduplicate claims, score confidence, choose targets, or decide admission.

## Claim Boundary

Each claim asserts exactly one thing with one truth value.

Use three checks before returning a claim:

- Split test: if part of the sentence can be challenged separately, return separate claims.
- Negation test: if negating one part leaves another assertion intact, split them.
- Standalone test: each claim should be understandable on its own, with its qualifiers included.

Keep qualifiers in the claim text. Dates, quantities, units, scopes, conditions, exceptions, and comparison classes belong with the assertion they qualify.

Causal passages decompose into the component claims plus the causal claim when the source itself asserts or implies the cause.

## Fidelity

Use only what the source supports. Restatement can clarify the assertion, but it must not add facts the document did not say.

Inferred claims are allowed and valuable. Mark them with `assertion: "inferred"` and cite the explicit `claim_id` values they come from in `inferred_from`.

The defense test governs inference: someone holding the original source should be able to see why the document implies the claim.

## Modality

Classify modality as the source's posture, not as truth:

- `empirical`: presented as an observation, measurement, description, or fact claim.
- `normative`: presented as a rule, obligation, recommendation, or value judgment.
- `projection`: presented as a forecast, expectation, scenario, or conditional future.
- `reported`: attributed to another speaker, source, study, or organization.
- `rhetorical`: posed for emphasis, framing, or persuasion rather than direct factual assertion.

## Bundle Vocabulary

Use the bundle contract vocabulary exactly:

- `claim_id`: document-local id only.
- `text`: the atomic claim text with qualifiers included.
- `kind`: `taxonomic`, `structural`, `causal`, `functional`, `spatial`, `temporal`, `attributive`, or `comparative`.
- `modality`: one modality value.
- `assertion`: `explicit` or `inferred`.
- `inferred_from`: explicit claim ids for inferred claims.
- `predicate`: optional compact relation phrase.
- `mentions`: unresolved spans with `role` and `kind_hint`.
- `provenance`: source-unit locator with optional quote.
- `flags`: only `unresolved_referent`, `needs_split`, or `uncited_statistic`.

Mention roles are `g_subject`, `g_object`, or `other`. Kind hints are `actor`, `object`, `concept`, or `event`.

Use flags sparingly. A flag is a rent-bearing signal for a downstream consumer, not a place for general notes.
