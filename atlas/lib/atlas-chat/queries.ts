import { and, asc, desc, eq, gte, lt, or, sql } from "drizzle-orm";
import type { HandleMessageStreamEvent, SessionState } from "eve/client";

import { isAtlasChatTurnSettledEvent } from "@/lib/atlas-chat/events";
import {
  createAtlasChatFallbackTitle,
  defaultAtlasChatTitle,
} from "@/lib/atlas-chat/title";
import type {
  ActiveAtlasChat,
  AtlasChatContext,
  AtlasChatListItem,
} from "@/lib/atlas-chat/types";
import { atlasChat, atlasChatEvent } from "@/lib/db/schema";
import { db } from "@/lib/db/client";

const atlasChatHistoryPageSize = 20;

type AtlasChatListPage = {
  items: AtlasChatListItem[];
  nextCursor: string | null;
};

type CreateAtlasChatInput = {
  context?: AtlasChatContext;
  pendingUserMessage?: string;
  userId: string;
};

type MarkPendingMessageInput = {
  chatId: string;
  message: string;
  userId: string;
};

type ChatOwnershipInput = {
  chatId: string;
  userId: string;
};

type AppendAtlasChatEventInput = ChatOwnershipInput & {
  event: HandleMessageStreamEvent;
  eventIndex: number;
};

type SaveAtlasChatSnapshotInput = ChatOwnershipInput & {
  events: readonly HandleMessageStreamEvent[];
  session: SessionState;
};

export async function listAtlasChatsByUser(
  userId: string,
  cursor?: string | null,
): Promise<AtlasChatListPage> {
  const cursorValue = cursor?.trim();
  const parsedCursor = cursorValue ? decodeAtlasChatCursor(cursorValue) : null;
  const rows = await db
    .select({
      activeDocumentShardId: atlasChat.activeDocumentShardId,
      documentId: atlasChat.documentId,
      domainId: atlasChat.domainId,
      id: atlasChat.id,
      mode: atlasChat.mode,
      selectedRecordId: atlasChat.selectedRecordId,
      selectedRecordTable: atlasChat.selectedRecordTable,
      title: atlasChat.title,
      updatedAt: atlasChat.updatedAt,
      viewId: atlasChat.viewId,
    })
    .from(atlasChat)
    .where(
      and(
        eq(atlasChat.ownerUserId, userId),
        parsedCursor
          ? or(
              lt(atlasChat.updatedAt, parsedCursor.updatedAt),
              and(
                eq(atlasChat.updatedAt, parsedCursor.updatedAt),
                lt(atlasChat.id, parsedCursor.id),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(desc(atlasChat.updatedAt), desc(atlasChat.id))
    .limit(atlasChatHistoryPageSize + 1);

  const hasMore = rows.length > atlasChatHistoryPageSize;
  const pageRows = hasMore ? rows.slice(0, atlasChatHistoryPageSize) : rows;
  const last = pageRows[pageRows.length - 1];

  return {
    items: pageRows.map((row) => ({
      context: rowToAtlasChatContext(row),
      id: row.id,
      title: row.title,
      updatedAt: row.updatedAt.toISOString(),
    })),
    nextCursor: hasMore && last ? encodeAtlasChatCursor(last.updatedAt, last.id) : null,
  };
}

export async function createAtlasChat({
  context,
  pendingUserMessage,
  userId,
}: CreateAtlasChatInput): Promise<AtlasChatListItem> {
  const pendingMessage = pendingUserMessage?.trim();
  const [row] = await db
    .insert(atlasChat)
    .values({
      activeDocumentShardId: cleanOptionalUuid(context?.activeDocumentShardId),
      documentId: cleanOptionalUuid(context?.documentId),
      domainId: cleanOptionalUuid(context?.domainId),
      mode: cleanOptionalText(context?.mode),
      ownerUserId: userId,
      pendingUserMessage: pendingMessage || null,
      pendingUserMessageCreatedAt: pendingMessage ? new Date() : null,
      selectedRecordId: cleanOptionalUuid(context?.selectedRecordId),
      selectedRecordTable: cleanOptionalText(context?.selectedRecordTable),
      title: pendingMessage
        ? createAtlasChatFallbackTitle(pendingMessage)
        : defaultAtlasChatTitle,
      viewId: cleanOptionalUuid(context?.viewId),
    })
    .returning({
      activeDocumentShardId: atlasChat.activeDocumentShardId,
      documentId: atlasChat.documentId,
      domainId: atlasChat.domainId,
      id: atlasChat.id,
      mode: atlasChat.mode,
      selectedRecordId: atlasChat.selectedRecordId,
      selectedRecordTable: atlasChat.selectedRecordTable,
      title: atlasChat.title,
      updatedAt: atlasChat.updatedAt,
      viewId: atlasChat.viewId,
    });

  if (!row) {
    throw new Error("Failed to create Atlas chat.");
  }

  return {
    context: rowToAtlasChatContext(row),
    id: row.id,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getAtlasChatForUser(
  chatId: string,
  userId: string,
): Promise<ActiveAtlasChat | null> {
  const [row] = await db
    .select({
      activeDocumentShardId: atlasChat.activeDocumentShardId,
      documentId: atlasChat.documentId,
      domainId: atlasChat.domainId,
      eveSession: atlasChat.eveSession,
      id: atlasChat.id,
      mode: atlasChat.mode,
      pendingUserMessage: atlasChat.pendingUserMessage,
      pendingUserMessageCreatedAt: atlasChat.pendingUserMessageCreatedAt,
      selectedRecordId: atlasChat.selectedRecordId,
      selectedRecordTable: atlasChat.selectedRecordTable,
      title: atlasChat.title,
      viewId: atlasChat.viewId,
    })
    .from(atlasChat)
    .where(and(eq(atlasChat.id, chatId), eq(atlasChat.ownerUserId, userId)))
    .limit(1);

  if (!row) {
    return null;
  }

  const eventRows = await db
    .select({
      createdAt: atlasChatEvent.createdAt,
      event: atlasChatEvent.event,
    })
    .from(atlasChatEvent)
    .where(eq(atlasChatEvent.chatId, chatId))
    .orderBy(asc(atlasChatEvent.eventIndex));
  const pendingMessageCreatedAt = row.pendingUserMessageCreatedAt;
  const hasCurrentTurnSettled = Boolean(
    pendingMessageCreatedAt &&
      eventRows.some(
        (eventRow) =>
          eventRow.createdAt >= pendingMessageCreatedAt &&
          isAtlasChatTurnSettledEvent(eventRow.event),
      ),
  );

  return {
    context: rowToAtlasChatContext(row),
    events: eventRows.map((eventRow) => eventRow.event),
    id: row.id,
    pendingUserMessage: hasCurrentTurnSettled ? null : row.pendingUserMessage,
    session: row.eveSession ?? undefined,
    title: row.title,
  };
}

export async function getLatestAtlasChatForUser(
  userId: string,
  context: AtlasChatContext,
): Promise<ActiveAtlasChat | null> {
  const [row] = await db
    .select({ id: atlasChat.id })
    .from(atlasChat)
    .where(
      and(
        eq(atlasChat.ownerUserId, userId),
        sql`${atlasChat.activeDocumentShardId} is not distinct from ${cleanOptionalUuid(context.activeDocumentShardId)}`,
        sql`${atlasChat.documentId} is not distinct from ${cleanOptionalUuid(context.documentId)}`,
        sql`${atlasChat.domainId} is not distinct from ${cleanOptionalUuid(context.domainId)}`,
        sql`${atlasChat.mode} is not distinct from ${cleanOptionalText(context.mode)}`,
        sql`${atlasChat.selectedRecordId} is not distinct from ${cleanOptionalUuid(context.selectedRecordId)}`,
        sql`${atlasChat.selectedRecordTable} is not distinct from ${cleanOptionalText(context.selectedRecordTable)}`,
        sql`${atlasChat.viewId} is not distinct from ${cleanOptionalUuid(context.viewId)}`,
      ),
    )
    .orderBy(desc(atlasChat.updatedAt), desc(atlasChat.id))
    .limit(1);

  return row ? getAtlasChatForUser(row.id, userId) : null;
}

export async function markAtlasChatPendingMessage({
  chatId,
  message,
  userId,
}: MarkPendingMessageInput): Promise<AtlasChatListItem> {
  const pendingMessage = message.trim();

  if (!pendingMessage) {
    throw new Error("Message cannot be empty.");
  }

  const [row] = await db
    .update(atlasChat)
    .set({
      pendingUserMessage: pendingMessage,
      pendingUserMessageCreatedAt: new Date(),
      title: sql<string>`
        case
          when ${atlasChat.title} = ${defaultAtlasChatTitle}
          then ${createAtlasChatFallbackTitle(pendingMessage)}
          else ${atlasChat.title}
        end
      `,
      updatedAt: new Date(),
    })
    .where(and(eq(atlasChat.id, chatId), eq(atlasChat.ownerUserId, userId)))
    .returning({
      activeDocumentShardId: atlasChat.activeDocumentShardId,
      documentId: atlasChat.documentId,
      domainId: atlasChat.domainId,
      id: atlasChat.id,
      mode: atlasChat.mode,
      selectedRecordId: atlasChat.selectedRecordId,
      selectedRecordTable: atlasChat.selectedRecordTable,
      title: atlasChat.title,
      updatedAt: atlasChat.updatedAt,
      viewId: atlasChat.viewId,
    });

  if (!row) {
    throw new Error("Atlas chat not found.");
  }

  return {
    context: rowToAtlasChatContext(row),
    id: row.id,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function clearAtlasChatPendingMessage({
  chatId,
  userId,
}: ChatOwnershipInput) {
  await db
    .update(atlasChat)
    .set({
      pendingUserMessage: null,
      pendingUserMessageCreatedAt: null,
    })
    .where(and(eq(atlasChat.id, chatId), eq(atlasChat.ownerUserId, userId)));
}

export async function appendAtlasChatEvent({
  chatId,
  event,
  eventIndex,
  userId,
}: AppendAtlasChatEventInput) {
  if (eventIndex < 0) {
    throw new Error("Event index cannot be negative.");
  }

  await assertAtlasChatOwnership({ chatId, userId });

  await db
    .insert(atlasChatEvent)
    .values({
      chatId,
      event,
      eventIndex,
    })
    .onConflictDoUpdate({
      set: { event },
      target: [atlasChatEvent.chatId, atlasChatEvent.eventIndex],
    });
}

export async function saveAtlasChatSnapshot({
  chatId,
  events,
  session,
  userId,
}: SaveAtlasChatSnapshotInput) {
  await assertAtlasChatOwnership({ chatId, userId });

  if (events.length > 0) {
    await db
      .insert(atlasChatEvent)
      .values(
        events.map((event, eventIndex) => ({
          chatId,
          event,
          eventIndex,
        })),
      )
      .onConflictDoUpdate({
        set: { event: sql`excluded.event` },
        target: [atlasChatEvent.chatId, atlasChatEvent.eventIndex],
      });
  }

  await db
    .delete(atlasChatEvent)
    .where(and(eq(atlasChatEvent.chatId, chatId), gte(atlasChatEvent.eventIndex, events.length)));

  await db
    .update(atlasChat)
    .set({
      eveSession: session,
      pendingUserMessage: null,
      pendingUserMessageCreatedAt: null,
      updatedAt: new Date(),
    })
    .where(and(eq(atlasChat.id, chatId), eq(atlasChat.ownerUserId, userId)));
}

export async function saveAtlasChatSessionState({
  chatId,
  session,
  userId,
}: ChatOwnershipInput & { session: SessionState }) {
  await db
    .update(atlasChat)
    .set({
      eveSession: session,
    })
    .where(and(eq(atlasChat.id, chatId), eq(atlasChat.ownerUserId, userId)));
}

export async function deleteAtlasChatForUser({ chatId, userId }: ChatOwnershipInput) {
  await db
    .delete(atlasChat)
    .where(and(eq(atlasChat.id, chatId), eq(atlasChat.ownerUserId, userId)));
}

async function assertAtlasChatOwnership({ chatId, userId }: ChatOwnershipInput) {
  const [ownedChat] = await db
    .select({ id: atlasChat.id })
    .from(atlasChat)
    .where(and(eq(atlasChat.id, chatId), eq(atlasChat.ownerUserId, userId)))
    .limit(1);

  if (!ownedChat) {
    throw new Error("Atlas chat not found.");
  }
}

function encodeAtlasChatCursor(updatedAt: Date, id: string) {
  return `${updatedAt.toISOString()}::${id}`;
}

function decodeAtlasChatCursor(cursor: string) {
  const [updatedAtRaw, id] = cursor.split("::");

  if (!updatedAtRaw || !id) {
    return null;
  }

  const updatedAt = new Date(updatedAtRaw);

  if (Number.isNaN(updatedAt.getTime())) {
    return null;
  }

  return { id, updatedAt };
}

function rowToAtlasChatContext(row: {
  activeDocumentShardId: string | null;
  documentId: string | null;
  domainId: string | null;
  mode: string | null;
  selectedRecordId: string | null;
  selectedRecordTable: string | null;
  viewId: string | null;
}): AtlasChatContext {
  return {
    activeDocumentShardId: row.activeDocumentShardId,
    documentId: row.documentId,
    domainId: row.domainId,
    mode: row.mode,
    selectedRecordId: row.selectedRecordId,
    selectedRecordTable: row.selectedRecordTable,
    viewId: row.viewId,
  };
}

function cleanOptionalText(value: string | null | undefined) {
  return value?.trim() || null;
}

function cleanOptionalUuid(value: string | null | undefined) {
  return value?.trim() || null;
}
