import assert from "node:assert/strict";
import type { HandleMessageStreamEvent } from "eve/client";

import {
  advanceSessionWithLocalEvents,
  createAuthorizationSkippedEvents,
  getPendingAtlasAuthorizations,
  hasOpenAtlasChatTurn,
  reduceAtlasEventsToMessageData,
} from "@/lib/atlas-chat/client-events";
import { isAtlasChatTurnSettledEvent } from "@/lib/atlas-chat/events";
import {
  getAtlasChatMessageLengthError,
  maxAtlasChatMessageChars,
} from "@/lib/atlas-chat/limits";
import {
  createAtlasChatFallbackTitle,
  defaultAtlasChatTitle,
} from "@/lib/atlas-chat/title";

assert.equal(createAtlasChatFallbackTitle(""), defaultAtlasChatTitle);
assert.equal(createAtlasChatFallbackTitle("  Map the solar system  "), "Map the solar system");
assert.equal(
  createAtlasChatFallbackTitle(
    "This prompt is intentionally much longer than the title budget so the title is trimmed",
  ),
  "This prompt is intentionally much longer than the title...",
);

assert.equal(getAtlasChatMessageLengthError("short message"), null);
assert.match(
  getAtlasChatMessageLengthError("x".repeat(maxAtlasChatMessageChars + 1)) ?? "",
  /Message is too long/,
);

assert.equal(
  isAtlasChatTurnSettledEvent(testEvent("session.completed")),
  true,
);
assert.equal(
  isAtlasChatTurnSettledEvent(testEvent("session.failed")),
  true,
);
assert.equal(
  isAtlasChatTurnSettledEvent(testEvent("session.waiting")),
  true,
);
assert.equal(
  isAtlasChatTurnSettledEvent(testEvent("message.received")),
  false,
);

const openTurnEvents = [
  {
    data: {
      sequence: 1,
      turnId: "turn_1",
    },
    type: "turn.started",
  },
  {
    data: {
      message: "Map the solar system",
      sequence: 2,
      turnId: "turn_1",
    },
    type: "message.received",
  },
] satisfies readonly HandleMessageStreamEvent[];
const settledTurnEvents = [
  ...openTurnEvents,
  {
    data: {
      wait: "next-user-message",
    },
    type: "session.waiting",
  },
] satisfies readonly HandleMessageStreamEvent[];

assert.equal(hasOpenAtlasChatTurn(openTurnEvents), true);
assert.equal(hasOpenAtlasChatTurn(settledTurnEvents), false);
assert.equal(
  reduceAtlasEventsToMessageData(openTurnEvents).messages.at(-1)?.role,
  "user",
);
assert.equal(
  reduceAtlasEventsToMessageData(openTurnEvents).messages.at(-1)?.parts[0]?.type,
  "text",
);

const authorizationRequiredEvent = {
  data: {
    authorization: {
      displayName: "Notion",
      instructions: "Connect Notion to continue.",
      url: "https://example.com/connect",
      userCode: "ABCD-EFGH",
    },
    description: "Authorization required.",
    name: "notion",
    sequence: 3,
    stepIndex: 0,
    turnId: "turn_1",
  },
  type: "authorization.required",
} satisfies HandleMessageStreamEvent;
const pendingAuthorizations = getPendingAtlasAuthorizations([
  ...openTurnEvents,
  authorizationRequiredEvent,
]);

assert.equal(pendingAuthorizations.length, 1);
assert.equal(pendingAuthorizations[0]?.displayName, "Notion");
assert.equal(pendingAuthorizations[0]?.userCode, "ABCD-EFGH");

const skippedEvents = createAuthorizationSkippedEvents(pendingAuthorizations[0]!);

assert.equal(skippedEvents[0]?.type, "authorization.completed");
assert.equal(skippedEvents[1]?.type, "session.waiting");
assert.equal(
  getPendingAtlasAuthorizations([
    ...openTurnEvents,
    authorizationRequiredEvent,
    ...skippedEvents,
  ]).length,
  0,
);
assert.deepEqual(
  advanceSessionWithLocalEvents(
    {
      continuationToken: "token_1",
      sessionId: "session_1",
      streamIndex: 4,
    },
    skippedEvents,
  ),
  {
    continuationToken: "token_1",
    sessionId: "session_1",
    streamIndex: 6,
  },
);

console.log("Atlas chat runtime helpers verified.");

function testEvent(type: string) {
  return { type } as HandleMessageStreamEvent;
}
