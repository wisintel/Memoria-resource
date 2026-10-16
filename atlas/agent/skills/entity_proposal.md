Use when the user asks Atlas to propose, extract, add, create, or draft a candidate entity.

Before calling propose_entity:

1. Identify the active domain from client context. If there is no active domain, ask David to select one.
2. Inspect the active domain with get_domain_context.
3. If client context includes a viewId and the request concerns the current graph, map, or visible workspace, inspect it with get_graph_view.
4. Search for likely duplicates with search_entities using the candidate label or the most distinctive label fragment.
5. If an existing entity is a clear match, do not call propose_entity. Tell David which existing entity appears to match.
6. If an existing entity is a possible duplicate or alias, do not call propose_entity. Suggest reviewing it as an alias, merge, or naming decision.
7. If the candidate appears new enough to review, call propose_entity with the proposed label, domainId, type or status labels when known, confidence, rationale, evidence, and any unresolved questions.

Keep the proposal compact and make uncertainty explicit.
