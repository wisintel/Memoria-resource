import type {
  AuthorizationRequiredStreamEvent,
  EveMessageData,
  HandleMessageStreamEvent,
  SessionState,
} from "eve/client";
import { defaultMessageReducer } from "eve/react";

import { isAtlasChatTurnSettledEvent } from "@/lib/atlas-chat/events";

export type PendingAtlasAuthorization = {
  authorization: AuthorizationRequiredStreamEvent["data"]["authorization"];
  description: string;
  displayName: string;
  expiresAt?: string;
  key: string;
  name: string;
  sequence: number;
  stepIndex: number;
  turnId: string;
  url?: string;
  userCode?: string;
};

export function reduceAtlasEventsToMessageData(
  events: readonly HandleMessageStreamEvent[],
): EveMessageData {
  const reducer = defaultMessageReducer();
  let data = reducer.initial();

  for (const event of events) {
    data = reducer.reduce(data, event);
  }

  return data;
}

export function hasOpenAtlasChatTurn(
  events: readonly HandleMessageStreamEvent[],
) {
  let open = false;

  for (const event of events) {
    if (event.type === "turn.started") {
      open = true;
    } else if (isAtlasChatTurnSettledEvent(event)) {
      open = false;
    }
  }

  return open;
}

export function getPendingAtlasAuthorizations(
  events: readonly HandleMessageStreamEvent[],
) {
  const pending = new Map<string, PendingAtlasAuthorization>();

  for (const event of events) {
    if (event.type === "authorization.required") {
      const authorization = toPendingAuthorization(event);
      pending.set(authorization.key, authorization);
      continue;
    }

    if (event.type === "authorization.completed") {
      pending.delete(`${event.data.turnId}:${event.data.name}`);
    }
  }

  return [...pending.values()];
}

export function createAuthorizationSkippedEvents(
  authorization: PendingAtlasAuthorization,
): readonly HandleMessageStreamEvent[] {
  return [
    {
      data: {
        authorization: authorization.authorization,
        name: authorization.name,
        outcome: "declined",
        reason: "skipped",
        sequence: authorization.sequence,
        stepIndex: authorization.stepIndex,
        turnId: authorization.turnId,
      },
      type: "authorization.completed",
    },
    {
      data: {
        wait: "next-user-message",
      },
      type: "session.waiting",
    },
  ];
}

export function advanceSessionWithLocalEvents(
  session: SessionState,
  events: readonly HandleMessageStreamEvent[],
): SessionState {
  if (!session.sessionId || events.length === 0) {
    return session;
  }

  return {
    continuationToken: session.continuationToken,
    sessionId: session.sessionId,
    streamIndex: session.streamIndex + events.length,
  };
}

function toPendingAuthorization(
  event: AuthorizationRequiredStreamEvent,
): PendingAtlasAuthorization {
  const challenge = event.data.authorization;
  const displayName =
    challenge?.displayName ?? titleCaseConnectionName(event.data.name);

  return {
    authorization: challenge,
    description:
      challenge?.instructions ||
      event.data.description ||
      `Connect ${displayName} to let Atlas continue.`,
    displayName,
    expiresAt: challenge?.expiresAt,
    key: `${event.data.turnId}:${event.data.name}`,
    name: event.data.name,
    sequence: event.data.sequence,
    stepIndex: event.data.stepIndex,
    turnId: event.data.turnId,
    url: challenge?.url,
    userCode: challenge?.userCode,
  };
}

function titleCaseConnectionName(value: string) {
  return (
    value
      .split(/[-_\s]+/g)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") || "service"
  );
}
