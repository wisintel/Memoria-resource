<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# AGENTS.md - Project Memoria (web)

Operating contract for any agent working in `app/web/`. Read this before implementing app changes. The project frame lives in `../../project_tracking/project.md`, current continuity lives in `../../project_tracking/session.md`, and architecture docs in `../../docs/architecture/` are source truth. The prior-art repos are reference only; do not copy their code wholesale. Archived packet history lives in `../../docs/_archive/handoffs/` as legacy evidence.

## Architecture conventions (load-bearing)

- **Single governed write path.** Every mutation goes through a command in `services/`. UI writes use thin Server Actions that validate request shape and call `services/*` — no product logic in actions, no direct DB access.
- **Transport: Server Actions by default; Route Handlers only when HTTP-native.** UI mutations use thin Server Actions (validate → call `services/*` → revalidate/return), **including from client dialogs**. Use a Route Handler (`app/api/*`) for a mutation only when it needs HTTP semantics: file upload, webhook/external caller, streaming, an agent/runtime endpoint, or a genuinely client-interactive surface doing incremental updates without navigation (the Observatory graph canvas is the sanctioned example). Reads default to **Server Components calling `services/*`** (workspace state is URL-driven, so panels re-render on navigation); use a focused Route Handler only for client-driven incremental reads (typeahead, live canvas). Whatever the transport, it calls `services/*` and owns no product logic.
- **No `data/` in the UI.** Components and Server Actions must not import `data/client` or `data/schema`. Reads happen in Server Components (or services); types come through `domain/`.
- **Identity is the UUID.** Every first-class object has one `objects` row; semantic tables share its primary key. Slugs/labels are mutable display/URL handles and never resolve identity on writes. No silent merge — collisions return typed errors.
- **Scoped data loading.** Load only what a surface needs. No universal/whole-app queries.
- **Workspace state in the URL.** Active domain, surface, selected record, etc. live in the URL, not local component state.
- **Respect milestone scope.** Don't pull in dependencies or build surfaces that belong to a later milestone (see `../../docs/architecture/11-build-roadmap.md`). Don't add deferred deps (DB driver beyond what's wired, `eve`/`ai`, graph libs, auth) ahead of their milestone.

## Styling conventions

Default to **shadcn/ui primitives + Tailwind utility classes**. This is the rule for ordinary UI.

- **Use the primitive.** Buttons, inputs, textareas, labels, cards, selects, dialogs, **badges, empty states, and form fields (the `Field` family)** all come from `components/ui/*`. Before styling a div by hand, check whether a primitive already covers it (`empty`, `badge`, `field`, `card`, `item`, …). If a needed primitive isn't installed yet, add it with `npx shadcn add <name>` — **do not** hand-roll it by copying its class string onto a raw `<input>`/`<section>`/etc. Tailwind is correct only where no primitive exists (layout/grid, a `dl`, a nav link).
- **Tailwind utilities are always fine** for layout, spacing, grid, and color/radius **tokens**. Prefer tokens (`bg-card`, `text-muted-foreground`, the radius token) over one-off values (e.g. a bespoke `rounded-2xl` where the radius token applies).
- **Hand-rolled / bespoke CSS is permitted as a deliberate exception**, not the default — for things shadcn and Tailwind genuinely cannot express (a custom graph canvas, a keyframe animation, a novel interaction). When you use it, call it out in your report with a one-line justification. It must never become the general way the app is styled.

The test: if a shadcn primitive or a Tailwind utility can do it, use that. Reach for custom CSS only when neither can, and say so.

## Verification

Before reporting meaningful app work done:

- `npm run lint` and `npm run build` pass.
- For UI work: smoke-test the actual interaction (not just the build) in **both light and dark** mode.
- In your report, **list the shadcn primitives used** and **flag any hand-rolled markup or bespoke CSS with a justification** (expected: none, unless noted).
- Update `../../project_tracking/session.md` when the work changes current state, decisions, blockers, evidence, verification status, or next pickup.

## Pointers

- Project frame: `../../project_tracking/project.md`.
- Current session: `../../project_tracking/session.md`.
- Architecture: `../../docs/architecture/` (especially `10-implementation-architecture.md`, `11-build-roadmap.md`, `12-prior-art-audit.md`).
- Archived packet history: `../../docs/_archive/handoffs/`.
