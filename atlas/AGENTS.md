# AGENTS.md

This is the operating contract for agents working in the standalone Atlas app repo.

Atlas is the product/app shell. Memoria is the knowledge-graph capability inside Atlas, not the whole app or repo identity.

## Startup

At the start of continuity-sensitive work:

1. Read this `AGENTS.md`.
2. Inspect the files directly relevant to the requested change.
3. If durable project notes are added later, prefer those routed notes over chat memory.

For lightweight questions, read only the files needed to answer accurately.

## Source Boundaries

- The Next.js app lives at the repo root: `app/`, `components/`, `lib/`, and `public/`.
- Supabase config and migrations live in `supabase/`.
- The active Atlas database runs in Supabase Cloud. Do not assume local Supabase is running or authoritative.
- For Supabase inspection, verification, and data changes, use the Supabase Cloud project through MCP/OAuth unless the user explicitly asks for local Supabase. Use the Supabase CLI for migration file creation and other source-control tasks, not as evidence that a local database is authoritative.
- Atlas deploys through Vercel. Treat deployment-related configuration as production-facing.
- Generated output, local runtimes, local secrets, build folders, and dependency installs are not source truth.
- Database migrations are source truth and must be tracked unless there is an explicit reason not to track one.
- Runtime document-conversion dependencies should become app-owned or explicitly configured. Do not add hidden parent-folder coupling.

## Collaboration Rules

- Follow the user's latest explicit instruction.
- Work in bounded chunks.
- Check in before meaningful edits, risky commands, destructive changes, broad test runs, or non-obvious direction changes.
- Do not silently switch to a workaround after a failure. Explain what failed and wait for approval before changing approach.
- Be direct, clear, and concise.

## Implementation Rules

- Keep changes scoped to the requested task.
- Prefer existing local patterns before introducing new abstractions.
- Do not rename or rebrand concepts broadly unless the user explicitly asks.
- Do not add placeholder, mocked, or partial implementations without saying so plainly.
- Do not create commits or branches unless the user explicitly asks.
- Do not expose secrets or private tokens.

## Verification

Use the narrowest meaningful check:

- For docs, prompt, config, and copy changes: inspect the changed files.
- For narrow code changes: run the nearest relevant check.
- For schema changes: verify the migration file and TypeScript shape locally, then apply or inspect against Supabase Cloud only when the user approves that remote action.
- For UI changes: ask before taking control of the browser unless the user explicitly asks for browser verification.

Before marking work done, report what changed, what was verified, what remains uncertain, and any required follow-up.
