Start with the **data layer — TanStack Query + API consolidation — preceded by a short guardrails pass.** Everything else you listed is downstream of it, and here's the dependency logic, because the order is the actual architectural decision here:

The reason you have separate shells, 24 `useState`s, and 30-prop components isn't really a shell problem — it's that App.tsx owns all the server state by hand and drills it everywhere. If you consolidate the shell _first_, you'll move all that prop-drilling into a new shell and then tear it apart again when Query lands. That's wasted motion and exactly the entropy you're trying to kill. So data first.

The sequence I'd run:

1. **Phase 0 — Guardrails (small, do before any feature work).** Stand up the `QueryClientProvider`, and put the rails in place for the session agents: knip + dependency-cruiser in CI, and an AGENTS.md ruleset ("server data goes through Query hooks, never `useState`+manual refetch"; "shared helpers import from `lib/`, never redefine"; "styling is shadcn/Tailwind only, no new CSS classes"). Given agents are doing the edits, the rules are what keep this from re-sprawling.
    
2. **Phase 1 — Query over the _existing_ API, then normalize endpoints behind it.** First wrap today's `api.ts` in Query hooks (one module per domain: graph, documents, pipeline). That alone deletes most of the 24 state vars, the manual `setSnapshot`/refetch, the `isBusy` flags, and the `loadDocuments` double-fetch. _Then_ — with the hooks as a stable seam — consolidate the server endpoints (a coarse bootstrap query, batched mutations) underneath, without touching component code. This is how #1 and #5 get done together and safely.
    
3. **Phase 2 — One shell.** Now that data lives in hooks instead of being drilled from App, collapsing the three shells into one `<AppShell>` (nav rail + single content outlet, shared chrome like the domain selector lifted up) is mostly layout work, not a data untangling. Much lower risk after Phase 1.
    
4. **Phase 3 — Design standardization / kill hand-rolled CSS.** Per-view, against the now-stable shell and components. Doing this earlier means restyling things that move or disappear in 1–2.
    
5. **Phase 4 — The saveable workbench tool template.** Capstone, because it sits on all of the above: it needs Query mutations to be "saveable," the shell slot to live in, and the design system to be its UI. It also needs one product decision from you — what a "tool" is as a schema (prompt + context + model + output + persistence) — which is cleaner to make once the foundation is real.
    

So the literal answer to "where do I start": Phase 0 guardrails, then the Query hooks over the existing API. That single move unblocks the shell, which unblocks the design pass, which unblocks the template.

Want me to scope Phase 0 + the Phase 1 Query layer into a concrete work package you can hand to a session agent — including the hook module structure and what to migrate first?