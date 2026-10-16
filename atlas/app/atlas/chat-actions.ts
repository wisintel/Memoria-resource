"use server";

import type { HandleMessageStreamEvent, SessionState } from "eve/client";

import {
  appendAtlasChatEvent,
  clearAtlasChatPendingMessage,
  createAtlasChat,
  deleteAtlasChatForUser,
  getAtlasChatForUser,
  listAtlasChatsByUser,
  markAtlasChatPendingMessage,
  saveAtlasChatSessionState,
  saveAtlasChatSnapshot,
} from "@/lib/atlas-chat/queries";
import { assertAtlasChatMessageLength } from "@/lib/atlas-chat/limits";
import { assertAtlasChatSendRateLimit } from "@/lib/atlas-chat/rate-limit";
import type { AtlasChatContext } from "@/lib/atlas-chat/types";
import { getServerViewer } from "@/lib/session";

export async function createAtlasChatAction(input?: {
  context?: AtlasChatContext;
  pendingUserMessage?: string;
}) {
  const viewer = await requireAtlasChatViewer();

  if (input?.pendingUserMessage) {
    assertAtlasChatMessageLength(input.pendingUserMessage);
  }

  return createAtlasChat({
    context: input?.context,
    pendingUserMessage: input?.pendingUserMessage,
    userId: viewer.id,
  });
}

export async function listAtlasChatsAction(input?: { cursor?: string | null }) {
  const viewer = await requireAtlasChatViewer();

  return listAtlasChatsByUser(viewer.id, input?.cursor);
}

export async function getAtlasChatAction(chatId: string) {
  const viewer = await requireAtlasChatViewer();

  return getAtlasChatForUser(chatId, viewer.id);
}

export async function checkAtlasChatSendLimitAction(input?: { message?: string }) {
  const viewer = await requireAtlasChatViewer();

  if (input?.message) {
    assertAtlasChatMessageLength(input.message);
  }

  await assertAtlasChatSendRateLimit(viewer.id);

  return {
    allowed: true as const,
  };
}

export async function markAtlasChatPendingMessageAction(input: {
  chatId: string;
  message: string;
}) {
  const viewer = await requireAtlasChatViewer();

  assertAtlasChatMessageLength(input.message);

  return markAtlasChatPendingMessage({
    chatId: input.chatId,
    message: input.message,
    userId: viewer.id,
  });
}

export async function clearAtlasChatPendingMessageAction(chatId: string) {
  const viewer = await requireAtlasChatViewer();

  await clearAtlasChatPendingMessage({
    chatId,
    userId: viewer.id,
  });

  return { ok: true };
}

export async function appendAtlasChatEventAction(input: {
  chatId: string;
  event: HandleMessageStreamEvent;
  eventIndex: number;
}) {
  const viewer = await requireAtlasChatViewer();

  await appendAtlasChatEvent({
    chatId: input.chatId,
    event: input.event,
    eventIndex: input.eventIndex,
    userId: viewer.id,
  });

  return { ok: true };
}

export async function saveAtlasChatSnapshotAction(input: {
  chatId: string;
  events: readonly HandleMessageStreamEvent[];
  session: SessionState;
}) {
  const viewer = await requireAtlasChatViewer();

  await saveAtlasChatSnapshot({
    chatId: input.chatId,
    events: input.events,
    session: input.session,
    userId: viewer.id,
  });

  return { ok: true };
}

export async function saveAtlasChatSessionStateAction(input: {
  chatId: string;
  session: SessionState;
}) {
  const viewer = await requireAtlasChatViewer();

  await saveAtlasChatSessionState({
    chatId: input.chatId,
    session: input.session,
    userId: viewer.id,
  });

  return { ok: true };
}

export async function deleteAtlasChatAction(chatId: string) {
  const viewer = await requireAtlasChatViewer();

  await deleteAtlasChatForUser({
    chatId,
    userId: viewer.id,
  });

  return listAtlasChatsByUser(viewer.id);
}

async function requireAtlasChatViewer() {
  const viewer = await getServerViewer();

  if (!viewer) {
    throw new Error("Sign in with Vercel to use durable Atlas chat.");
  }

  return viewer;
}
