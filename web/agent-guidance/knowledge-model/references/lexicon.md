# Knowledge Model Lexicon

Canonical vocabulary for Project Memoria. Use these terms precisely — the boundaries between them are load-bearing. This reference is the runtime source of truth for this vocabulary; `docs/architecture/00-lexicon.md` is upstream reference that seeded it and may lag. When they differ, this reference wins.

Guiding rule: **labels are not identities.** A word that names a record does not decide what the record *is* or whether it may change.

## Source layer (faithful, unjudged)

- **Source** — External material as it arrives, before interpretation: a document, page, transcript, export, file, URL, note, or system record. Faithful and unjudged.
- **Intake** — The point where a source enters Atlas and its provenance, origin, authorship, date, type, and initial context are recorded, *before* meaning is extracted.
- **Document** — A registered source artifact managed by Atlas for intake, conversion, extraction, review, and retrieval.
- **Source Unit** — A bounded segment of a source document that can carry provenance and support extraction or retrieval. This is the unit of retrieval; a document is composed of source units (for markdown, heading-path shards).

Keep distinct: a **Source** is the raw material, a **Document** is the registered artifact, a **Source Unit** is a bounded segment inside it. Do not use them interchangeably.

## Knowledge objects (candidate → canonical)

- **Claim** — An atomic, truth-bearing statement extracted from or grounded in source material. A claim can be independently confirmed, denied, scoped, qualified, or revised.
- **Subject** — The canonical knowledge object that claims and relationships refer to. A subject can be a person, place, thing, event, concept, system, process, or other domain-relevant object. **Subject is the primary term.**
- **Entity** — A prior/implementation term used as an **alias for Subject**. Treat "entity" as "subject" unless a narrower meaning is explicitly defined later. Prefer "Subject" in all new output.
- **Relationship** — An authored or admitted connection between subjects, claims, or other graph records. Expresses domain meaning.
- **Reification** — The modeling move of turning something that could be expressed as a claim, relationship, event, or attribute into a first-class subject or object so it can carry its own claims, evidence, relationships, provenance, and review decisions. Reify only when the thing must be discussed, qualified, related, or governed as its own record.
- **Claim Attachment** — The non-structural link between a claim and the subject or object it is *about* ("this claim concerns this object"). Distinct from a **Relationship**: an attachment says what a claim is about; a relationship expresses domain meaning between records.
- **Evidence** — Material that supports, contradicts, or qualifies a specific claim or label and is traceable to source. Evidence attaches to **claims or labels, not directly to subjects** as standalone meaning.
- **Provenance** — The record of where material came from and how it moved through the system: source origin, preparation, extraction run, transformations, and admission decisions.

Guardrails: evidence does not attach directly to subjects; extraction does not decide salience or canonical truth; relationship admission is independent from admission of its endpoint subjects.

## Domain and map layer

- **Domain** — A salience boundary for knowledge, work, and retrieval context. Not a folder or topic — it is the *purpose* that makes foreground and background decidable.
- **Library** — A retired term for **Domain**. Earlier designs used "Library" as a top-level container above domains; it has been fully replaced by Domain. Treat any "Library" reference as "Domain" — there is no separate container construct.
- **Domain Map** — A purpose-scoped map that captures meaning, salience, and understanding by showing how subjects within a domain relate visually. The preferred target term for a saved visual map.
- **View** — A prior/implementation term for a purpose-scoped projection of graph data. Use **Domain Map** when the projection is a saved visual map.
- **Node** — A visual graph primitive representing a subject, claim, bundle item, or other mappable record on a Domain Map.
- **Edge** — A visual graph primitive representing a relationship or other connection between nodes on a Domain Map.
- **Cluster** — A visual grouping of nodes on a Domain Map, expressing proximity, containment, type grouping, or salience.

## Process and governance

- **Distillation** — Faithful extraction of source meaning into structured candidate knowledge, preserving asserted meaning and compressing form rather than significance.
- **Admission** — The review *decision* that accepts candidate knowledge into the governed graph.
- **Promotion** — The *act* of moving reviewed candidate knowledge into canonical graph records.
- **Canonical Memory** — The accepted, durable layer of admitted knowledge that the domain treats as current understanding.
- **Retrieval Walk** — A context-driven traversal of scoped knowledge used to provide relevant context to an AI agent. Not generic full-text search.
- **Authoring** — The human act of applying salience through naming, selecting, foregrounding, and drawing structure.
- **Domain Shaping** — An authoring activity that seeds or refines a domain's ontology, core subjects, seed relationships, and contextual structure so distillation has a usable prism.

Keep distinct: **Admission** is the decision, **Promotion** is the act that follows it. Candidate knowledge is not canonical until admitted; never describe a candidate as canonical memory.

## Product identity

- **Atlas** — The product and application shell, and the user-facing assistant identity. Refer to the assistant as Atlas.
- **Memoria** — The knowledge-graph capability inside Atlas (and a prior implementation kept as architecture evidence).
- **Eve** — Runtime plumbing only. Never expose Eve as the product or assistant identity.
