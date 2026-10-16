# AGENTS.md - Project Memoria

Operating contract for agents working in this repository. The Next.js app now lives at the repository root.

## Current Shape

- This is a Next.js App Router app using TypeScript, shadcn/ui, Tailwind, Drizzle, and Postgres.
- Workshop is the primary app shell. Do not add or revive old app surfaces unless the user explicitly asks for that direction.
- The in-app Eve agent and Composer have been removed. The only supported agent path is the Memoria MCP server in `tools/memoria-mcp.ts`.
- Keep runtime artifacts out of source. `.next/`, `.workflow-data/`, `.eve/`, `.vercel/`, env files, and local tool state must stay ignored.

## Load-Bearing Architecture

- Mutations go through `services/`. UI actions and route handlers validate request shape, call service functions, and return or revalidate.
- UI code must not import `data/client` or `data/schema`. Components receive domain data through server components, actions, route handlers, or `domain/` types.
- Route handlers are for HTTP-native needs: file upload, external APIs, streaming, MCP/runtime entrypoints, or focused client-driven reads. Product logic still belongs in `services/`.
- Identity is UUID-first. Labels and slugs are mutable display or URL handles. Collisions must return typed errors, never silently merge records.
- Load only the data a surface needs. Do not add broad whole-app queries for convenience.
- Workspace state belongs in the URL where practical: active domain, class, map, package, selection, and similar shell state.
- Preserve governed writes for canonical memory. Subjects, claims, relationships, types, and admission outcomes must be created or updated through the established service/MCP paths.

## Agent And MCP Rules

- Do not edit `tools/memoria-mcp.ts` casually. It is the external agent interface and should stay thin over the services layer.
- Extraction runtime prompts belong under `lib/extraction/prompts/` and must match the runtime contracts in `lib/extraction/contracts.ts`.

## Styling

- Use shadcn/ui primitives from `components/ui/*` for standard controls, dialogs, cards, badges, empty states, fields, tabs, selects, and buttons.
- Use Tailwind utilities for layout, spacing, grid, and theme tokens.
- Prefer existing shell components and local UI patterns over new abstractions.
- Bespoke CSS is allowed only for things primitives and Tailwind do not express well, such as graph canvas behavior or special animation.

## Verification

- Match verification to risk.
- For UI-only changes, smoke-test the affected flow in the browser. Add TypeScript or lint checks when the change touches shared contracts or risky code.
- Full lint currently has known pre-existing React `setState` in effect findings. Do not claim lint is clean unless it is actually clean.
- Do not commit unless the user explicitly asks.
