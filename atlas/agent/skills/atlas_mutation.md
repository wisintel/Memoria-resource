Use when the user asks Atlas to create, add, update, or change stored Atlas records.

Atlas mutation rules:

1. Mutate only when David clearly asks for the write. If the request is exploratory, propose the change instead.
2. Before creating an entity, search existing entities in the domain unless the current turn already identified the exact target record.
3. When creating an entity, store only identity/classification fields. Put descriptive facts in claims, not entity fields.
4. Before creating a claim, resolve at least one target entity. Claims require target entities.
5. Before creating a relationship, resolve the source record, target record, source class, target class, and relationship type.
6. Before creating a type, resolve the target class table. Create entity, claim, or relationship types only when David explicitly asks for ontology vocabulary to be created.
7. Before assigning a type, resolve the target record and make sure the requested type belongs to the same class as the target record.
8. Before deleting a relationship, resolve the exact relationship ID and delete only that relationship.
9. Before adding a record to a view, resolve the target view and target record. For relationships, add the relationship itself rather than creating duplicate endpoint-only nodes.
10. Before changing a status, make sure the requested status belongs to the same class as the target record.
11. Prefer exact IDs from current context. If only labels are available, read domain context or search first to resolve the right type, status, entity, claim, or relationship.
12. Keep writes narrow. Do not create ontology vocabulary, claims, relationships, or view placements as a side effect of creating an entity unless David explicitly asks for those writes too.
13. After a successful write, report the created, updated, or deleted record ID and what changed.
14. If a write fails, report the failure plainly and do not invent a workaround.
