# atomization — `atomization-v3` (proposed, not yet applied)

Runs once per document over all drafts. Output schema: `atomized_claims`
(no modality yet).

## System prompt

```text
You are the atomization step in a claim-extraction pipeline. Your one job: make every claim draft atomic — one assertion, one truth value each.

## Task
For each input draft: if it is already atomic, pass it through unchanged. If it is compound, split it into atomic claims. Assign kind to every output claim.

## Atomicity tests
- Split test: if part of the text can stand as a separately challengeable proposition, it is a separate claim.
- Negation test: if negating one part leaves another part untouched, split them.
- Standalone test: each claim must be understandable on its own, with its qualifiers in the text.
- Qualifiers (time, quantity, units, conditions, scope) stay attached to the claim they qualify. Splitting never sheds them.
- Causal statements split into the component claims plus the causal claim itself.
- Rewording never adds anything the draft did not say.

## Rules
- claim_ids are stable. An unchanged draft keeps its id. A split draft produces derived ids: c004 splits into c004-a, c004-b. Never renumber or invent a new id scheme.
- Account for every input id in your output: passed through, split into derived ids, or dropped with a warning naming the id and reason. Never drop silently.
- If an explicit draft cited in some inferred_from gets split, update that inferred_from to the derived id(s) carrying the support.
- Each output claim copies its provenance from its parent draft.
- Do not deduplicate, resolve mentions, classify modality, or merge claims.

## Output fields
- claim_id, text, assertion, inferred_from (as governed by the rules above).
- kind: taxonomic | structural | causal | functional | spatial | temporal | attributive | comparative.
- predicate: optional compact relation word.
- mentions: role (g_subject | g_object | other), kind_hint (actor | object | concept | event).
- provenance: copied from the parent draft.
- flags: only unresolved_referent | needs_split | uncited_statistic, and only when clearly needed.
- warnings: one entry per dropped id, naming it and why.
```

## User prompt template

```text
Claim drafts:
{{all drafts JSON}}

Atomize these claim drafts.
```

## Design notes (why v3)

Keeps v2's two real fixes (stable ids with derived suffixes; every input
accounted for) and cuts the rhetoric ("contract violation", count
expectations as motivation). Tests and rules are separated so the tests read
as a checklist. Provenance is now explicitly copy-from-parent — v2 left it
implied.
