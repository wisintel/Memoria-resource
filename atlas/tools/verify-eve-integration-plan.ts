import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = read("supabase/migrations/20260623015419_add_atlas_eve_chat_runtime.sql");
const eveChannel = read("agent/channels/eve.ts");
const composer = read("components/atlas/composer/MemoriaComposer.tsx");
const shell = read("components/atlas/shell/AtlasShell.tsx");
const chatActions = read("app/atlas/chat-actions.ts");
const persistedSession = read("lib/atlas-chat/persisted-session.ts");
const clientEvents = read("lib/atlas-chat/client-events.ts");
const dbClient = read("lib/db/client.ts");
const setup = read("lib/atlas-chat/setup.ts");
const plan = read("docs/eve-integration-plan.md");

assert.match(migration, /create table if not exists public\.atlas_chats/i);
assert.match(migration, /create table if not exists public\.atlas_chat_events/i);
assert.match(migration, /unique index if not exists idx_atlas_chat_events_chat_index/i);
assert.match(migration, /alter table public\.atlas_chats enable row level security/i);
assert.match(migration, /alter table public\.atlas_chat_events enable row level security/i);
assert.match(migration, /revoke all on table public\.atlas_chats from anon, authenticated/i);
assert.match(migration, /revoke all on table public\.atlas_chat_events from anon, authenticated/i);
assert.match(migration, /pending_user_message_created_at/i);

assert.match(eveChannel, /betterAuthEveAuth/);
assert.match(eveChannel, /process\.env\.NODE_ENV !== "production"/);
assert.doesNotMatch(eveChannel.replaceAll("\n", " "), /auth:\s*\[[^\]]*none\(\)/);

assert.match(chatActions, /createAtlasChatAction/);
assert.match(chatActions, /appendAtlasChatEventAction/);
assert.match(chatActions, /saveAtlasChatSnapshotAction/);
assert.match(chatActions, /checkAtlasChatSendLimitAction/);
assert.match(chatActions, /assertAtlasChatSendRateLimit/);

assert.match(persistedSession, /streamPersistedAtlasClientSession/);
assert.match(persistedSession, /ignoreLeadingWaiting/);
assert.match(persistedSession, /startIndex/);
assert.match(persistedSession, /authorization\.required/);

assert.match(clientEvents, /hasOpenAtlasChatTurn/);
assert.match(clientEvents, /getPendingAtlasAuthorizations/);
assert.match(clientEvents, /createAuthorizationSkippedEvents/);
assert.match(clientEvents, /advanceSessionWithLocalEvents/);

assert.match(composer, /createAtlasChatAction/);
assert.match(composer, /markAtlasChatPendingMessageAction/);
assert.match(composer, /appendAtlasChatEventAction/);
assert.match(composer, /saveAtlasChatSnapshotAction/);
assert.match(composer, /streamPersistedAtlasClientSession/);
assert.match(composer, /getPendingAtlasAuthorizations/);
assert.match(composer, /ComposerAuthorizationPrompt/);
assert.match(composer, /setNewChatUrl/);
assert.match(composer, /storeComposerDraft/);
assert.match(composer, /chatSetupStatus\.missing/);
assert.match(composer, /const chatInputBusy =/);
assert.match(composer, /const sourceToolBusy =/);
assert.match(composer, /disabled=\{sourceToolBusy\}/);

assert.match(shell, /getLatestAtlasChatForUser/);
assert.match(shell, /newChatParam !== "1"/);

assert.match(setup, /isAtlasChatRateLimitConfigured/);
assert.match(setup, /UPSTASH_REDIS_REST_URL/);
assert.match(setup, /DATABASE_URL or POSTGRES_URL/);
assert.match(dbClient, /required_columns/);
assert.match(dbClient, /idx_atlas_chat_events_chat_index/);
assert.match(dbClient, /relrowsecurity/);
assert.match(dbClient, /POSTGRES_URL/);

assert.match(plan, /Production Setup Checklist/);
assert.match(plan, /Remaining Approval-Gated Work/);

console.log("Eve integration plan source checks verified.");

function read(path: string) {
  return readFileSync(path, "utf8");
}
