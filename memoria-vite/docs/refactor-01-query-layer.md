# Refactor Package 01 — Data Layer (TanStack Query) + Guardrails

**Role of this doc:** hand-off spec for a session agent. Do exactly what's in scope; do not
do anything in the "Out of scope" list. This is Phase 0 + Phase 1a of the larger refactor.

**Why this is first:** App.tsx hand-manages all server state (24 `useState`s, manual
`setSnapshot`/refetch, a global `isBusy`). That tangle is what makes the shell hard to
consolidate and the components prop-heavy. Moving server state into a query cache removes
that tangle and becomes the seam every later phase builds on.

---

## Objective

1. **Phase 0 — Guardrails.** Install the tooling and conventions that stop the codebase from
   re-sprawling while agents work.
2. **Phase 1a — Query over the existing API.** Replace App.tsx's manual server-state
   (`useState` + `loadX()` + manual `setX`) with TanStack Query hooks. Keep the existing
   server endpoints exactly as they are. Keep the existing component prop interfaces.

The win at the end of this package: App.tsx no longer hand-manages server state, reads are
deduped/cached, and **mutations update the cache from their own response with no follow-up
GET**.

---

## Out of scope (DO NOT do these here — they are later packages)

- **Do NOT** consolidate the app shell or change navigation/layout (Phase 2).
- **Do NOT** change, merge, or add server endpoints. Wrap the API *as it is* (endpoint
  consolidation is Package 02, done behind these hooks afterward).
- **Do NOT** touch `styles.css` or restyle anything (Phase 3).
- **Do NOT** push hooks down into deep child components to remove prop-drilling. Call the
  hooks **in App.tsx** and keep passing the same props down. Prop-drilling removal happens
  when components move into the unified shell (Phase 2).
- **Do NOT** migrate the assistant streaming endpoint (`streamAssistantTurn`) — it is a
  stream, not a query. Leave `AssistantComposer` as-is.

---

## Phase 0 — Guardrails

1. **Install Query:** `npm i @tanstack/react-query` (v5).
2. **Dead-code + duplication detection:** `npm i -D knip`. Add a `knip.json` configured for
   the Vite/React entry (`src/main.tsx`). Add script `"knip": "knip"`.
3. **Layer boundaries:** `npm i -D dependency-cruiser`. Add a config that enforces the import
   direction **`lib` ← `features` ← `App`** and forbids one feature importing another
   feature directly. Add script `"depcruise": "depcruise src"`.
4. **Lint:** there is no ESLint config. Add a minimal flat config with
   `@typescript-eslint`, `eslint-plugin-unused-imports`, and `import/no-cycle`. Add script
   `"lint": "eslint src"`.
5. **Aggregate check:** add `"check": "tsc -b && npm run lint && npm run knip && npm run depcruise"`.
6. **Conventions:** append a "Refactor conventions" section to the repo-root `AGENTS.md`:
   - Server data is read/written through Query hooks in `features/*/use*.ts`. Never
     `useState` + manual `fetch`/refetch for server data.
   - Query keys come only from `src/lib/query-keys.ts`. Never inline a key array.
   - Shared helpers are imported from `src/lib/*`. Never redefine a helper that already
     exists there (e.g. `textValue`, `formatBytes`, `displayTypeLabel`, the `NO_*` sentinels).
   - Styling is shadcn + Tailwind utilities only. No new hand-rolled CSS classes.

**Acceptance for Phase 0:** `npm run check` runs (it may report pre-existing findings — that's
fine, it's the baseline). Provider not wired yet.

---

## Phase 1a — Query layer

### Step 1 — Client + provider

Create `src/lib/query-client.ts`:

```ts
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Local desktop tool talking to localhost: don't refetch on focus, cache briefly.
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      retry: 1,
    },
  },
});
```

Wire it in `src/main.tsx`, wrapping `<App />` (inside the existing error boundary):

```tsx
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/query-client";
// ...
<AppErrorBoundary>
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
</AppErrorBoundary>
```

### Step 2 — Query-key registry

Create `src/lib/query-keys.ts`. This is the single source of truth for keys:

```ts
export const queryKeys = {
  codexModels: () => ["codexModels"] as const,
  documents: () => ["documents"] as const,
  graph: (p: { viewId?: string | null; domainId?: string | null }) =>
    ["graph", p.viewId ?? null, p.domainId ?? null] as const,
  distillation: (p: { documentId?: string | null; domainId?: string | null; runId?: string | null }) =>
    ["distillation", p.documentId ?? null, p.domainId ?? null, p.runId ?? null] as const,
  admission: (p: { runId?: string | null }) => ["admission", p.runId ?? null] as const,
  prompts: (p: { toolKey: string; domainId?: string | null }) =>
    ["prompts", p.toolKey, p.domainId ?? null] as const,
} as const;
```

### Step 3 — The two canonical patterns (copy these exactly)

The whole package is two repeated patterns. Agents must not invent variants.

**Read hook:**

```ts
export function useDocuments() {
  return useQuery({ queryKey: queryKeys.documents(), queryFn: loadDocumentWorkbench });
}
```

**Mutation hook — write the response into the cache (no refetch):**

```ts
export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteDocument(id),          // returns DocumentWorkbenchSnapshot
    onSuccess: (snapshot) => qc.setQueryData(queryKeys.documents(), snapshot),
  });
}
```

**Rule for `onSuccess`:**
- If the mutation's return type **is** a cache's read-model → `setQueryData` that cache with
  the response. (This is the "no extra GET" win — use it wherever possible.)
- If the mutation also affects a **different** cache it does not return → additionally
  `qc.invalidateQueries({ queryKey })` for that other cache.

**Known cross-cache effects (capture these — they're easy to miss):**
- `importDocument` / `importDocumentFile` return `ImportDocumentResult` (a workbench snapshot
  plus `documentId` + `deduped`). → `setQueryData(documents)` **and**
  `invalidateQueries(graph)` (import creates graph items).
- `deleteDocument` returns `DocumentWorkbenchSnapshot`. → `setQueryData(documents)` **and**
  `invalidateQueries(graph)`.
- Graph mutations (`createItem`, `updateItem`, `deleteItem`, `createEdge`, `updateEdge`,
  `deleteEdge`, domain/view CRUD, `saveItemPositions`, `placeItem/Edge`, `resetWorkbench`)
  return `GraphSnapshot`. → `setQueryData(graph, <active key>)`. Also
  `invalidateQueries(documents)` and `invalidateQueries(distillation)` for create/delete of
  items/domains, since those views show derived counts.
- Admission/distillation mutations return `DistillationRunDetail`. → `setQueryData` the
  matching `distillation`/`admission` key, **and** `invalidateQueries(graph)` for
  admit/merge (they write canonical graph records).
- `runDomainContext` returns `GraphSnapshot` → `setQueryData(graph)`.

> Note on the graph key: the app shows one active view/domain at a time. Pass the **current**
> `{ viewId, domainId }` into the mutation hook (or read them from the returned snapshot's
> `activeView`/`activeDomain`) and write to that single active key. Do not try to update
> every possible graph key.

### Step 4 — Hook module layout (one per domain, in the owning feature folder)

- `src/features/graph/useGraph.ts` — `useGraph(params)` + all graph/domain/view/item/edge mutations.
- `src/features/intake/useDocuments.ts` — `useDocuments()` + import/delete/folder mutations.
- `src/features/pipeline/useDistillation.ts` — `useDistillation(params)`, run create/run/reset.
- `src/features/pipeline/useAdmission.ts` — `useAdmission(params)`, subject/candidate resolve.
- `src/features/pipeline/usePrompts.ts` — `usePrompts(params)`, prompt/version/binding mutations.
- `src/features/pipeline/useCodexModels.ts` — `useCodexModels()` (read-only).

Each file imports the existing functions from `src/api.ts` unchanged. `api.ts` is not edited
in this package.

### Step 5 — Migration order (one vertical slice at a time, verify between each)

1. **`codexModels`** (read-only warm-up). Replaces `workbenchModelOptions` state +
   `loadCodexModels` effect. Proves provider + read pattern.
2. **`documents`** (first full slice: read + mutations + cross-invalidation). Replaces
   `documentWorkbench` state, `loadDocuments`, and the import/delete/folder handlers. This
   also fixes the existing `loadDocuments` double-fetch for free.
3. **`graph`** (the big one). Replaces `snapshot` state + ~20 handlers in App.tsx. Highest
   blast radius — do it only after slices 1–2 are verified.
4. **`distillation` + `admission` + `prompts`** (pipeline). Replaces the ~14 pipeline state
   vars and ~17 pipeline handlers.

For each slice: introduce the hook(s) in App.tsx, delete the corresponding `useState` +
`loadX` effect + manual `setX` calls, keep the props passed to children identical, run the
verification below, then move to the next slice.

### Step 6 — Replace `isBusy`

Per-action busy state comes from `mutation.isPending` and `query.isFetching`. If a single
global busy indicator is still wanted during this package, derive it:
`const isBusy = useIsMutating() > 0;` Remove the manual `setIsBusy(true/false)` try/finally
wrappers as each handler is migrated. (Also delete the dead `async`-but-no-await
`clearWorkbench` busy toggle while you're in there.)

---

## Acceptance criteria & verification

After **each slice** (not just at the end):

1. `tsc -b` passes.
2. App boots and the migrated surface works by manual smoke test:
   - Slice 2: load documents, import a markdown + a PDF, delete a doc, create/collapse a
     shelf folder, move a doc into a folder — UI updates each time.
   - Slice 3: create/edit/delete an item and an edge, change domain and view, save layout,
     reset workbench — graph updates each time.
   - Slice 4: select document/run, create a run, run the subjects stage, admit/merge/reject a
     subject, run + save a domain-context profile, prompt library create/save/set-active.
3. **The "no extra GET" check (the point of the package):** with the browser Network tab
   open, perform a mutation (e.g. delete a document) and confirm there is **one** request
   (the mutation) and **no** follow-up GET to the snapshot endpoint.
4. `npm run check` shows no *new* knip/lint/boundary findings introduced by the change.

Final: App.tsx has no `useState` holding server data, no `loadX` effects for migrated
domains, and no manual `setSnapshot`/`setDocumentWorkbench`/`setDistillationState` calls.

---

## Hand-off notes for the architect (me) to review

Flag for review after slice 3: the graph key strategy (single active key vs. param-keyed) —
confirm the chosen approach before slice 4 builds on it. This is the one design decision in
the package with downstream consequences.
