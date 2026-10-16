# Extraction prompt copies

Printed, reviewable copies of every extraction pipeline prompt, exactly as
the model receives them. The runtime source is `lib/extraction/contracts.ts`;
these files are the review surface.

Convention: any prompt change bumps the contract's `version` string and ships
with a new printed copy named after it (`explicit-pass-draft-v3.md`, …). Old
versions stay in place so run history remains interpretable.

Each file shows the full assembled **system prompt** (shared vocabulary blocks
rendered inline, as joined at runtime) and the **user prompt template** with
`{{placeholders}}` for the JSON context blocks.
