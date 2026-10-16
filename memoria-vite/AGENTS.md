# AGENTS.md

This is the operating contract for agents working in the standalone Memoria app repo.

Memoria is a local graph and document-intake application. The app helps users turn source documents into an evidence-backed knowledge graph, inspect the graph, and manage graph views.

## Startup

At the start of continuity-sensitive work:

1. Read this `AGENTS.md`.
2. Inspect the files directly relevant to the requested change.
3. If durable project notes are added later, prefer those routed notes over chat memory.

For lightweight questions, read only the files needed to answer accurately.

## Source Boundaries

- The Vite app lives in `app/`.
- The local API server lives in `app/server/`.
- The current local app database is `app/data/memoria.sqlite`.
- Local runtime files, build output, dependency installs, and SQLite WAL/SHM files are not source truth.
- The database is app-owned state. Do not wipe, reset, or rewrite it unless the user explicitly confirms the exact action.
- Agent-created app rows should go through `tools/mcp/server.mjs` mutation tools, which call the app API; do not hand-roll direct SQLite writes unless the user explicitly confirms that path.
- Document intake, conversion, and viewing should be treated as app capabilities unless a separate canonical source-of-truth model is explicitly chosen.
- Do not assume a Markdown vault, discovery pipeline, or imported `_brain` workflow exists unless the relevant files are present in this repo and the user confirms that direction.
- Runtime document-conversion dependencies should become app-owned or explicitly configured. Do not add hidden parent-folder coupling.

## Collaboration Rules

- Follow the user's latest explicit instruction.
- Work in bounded chunks.
- Treat `go` as confirmation that the user understands the proposed bounded step and wants it executed.
- Check in before meaningful edits, risky commands, destructive changes, broad test runs, or non-obvious direction changes.
- Do not silently switch to a workaround after a failure. Explain what failed and wait for approval before changing approach.
- Be explicit about what is confirmed, inferred, and uncertain.
- Be direct, clear, and concise.

## Implementation Rules

- Keep changes scoped to the requested task.
- Prefer existing local patterns before introducing new abstractions.
- Do not rename or rebrand concepts broadly unless the user explicitly asks.
- Do not add placeholder, mocked, or partial implementations without saying so plainly.
- Do not create commits or branches unless the user explicitly asks.
- Do not expose secrets or private tokens.

## Product-Agent Direction

- Codex may stand in for the app assistant while Memoria's in-app agent runtime is being designed.
- When helping the user operate Memoria, explain the current graph or document state plainly.
- Separate source-backed claims, promoted relationships, entities, concepts, and view/layout state.
- Prefer compact proposals over silent mutation.
- Mutate stored Memoria records only when the user clearly asks to create, add, save, update, delete, import, convert, or change them.
- When the request is exploratory, inspect current state and propose changes for review.
- If a request depends on the active graph view, document list, selected item, or current browser state, inspect that state before answering.

## Verification

Use the narrowest meaningful check:

- For docs, prompt, config, and copy changes: inspect the changed files.
- For narrow code changes: run the nearest relevant check.
- For database changes: verify the schema/data effect locally and avoid destructive operations unless explicitly confirmed.
- For UI changes: use the local app and browser verification when the user asks for it or when the change is visually risky.

Before marking work done, report what changed, what was verified, what remains uncertain, and any required follow-up.

## Refactor conventions

- Server data is read/written through Query hooks in `features/*/use*.ts`. Never `useState` + manual `fetch`/refetch for server data.
- Query keys come only from `src/lib/query-keys.ts`. Never inline a key array.
- Shared helpers are imported from `src/lib/*`. Never redefine a helper that already exists there (e.g. `textValue`, `formatBytes`, `displayTypeLabel`, the `NO_*` sentinels).
- Styling is shadcn + Tailwind utilities only. No new hand-rolled CSS classes.
