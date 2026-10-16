import type { HandleMessageStreamEvent, SessionState } from "eve/client";

import type { ChatContext } from "@/lib/chat-context";

export type AtlasViewer = {
  email: string;
  id: string;
  image: string | null;
  name: string;
};

export type AtlasChatContext = Pick<
  ChatContext,
  | "activeDocumentShardId"
  | "documentId"
  | "domainId"
  | "mode"
  | "selectedRecordId"
  | "selectedRecordTable"
  | "viewId"
>;

export type AtlasChatListItem = {
  context: AtlasChatContext;
  id: string;
  title: string;
  updatedAt: string;
};

export type ActiveAtlasChat = {
  context: AtlasChatContext;
  events: readonly HandleMessageStreamEvent[];
  id: string;
  pendingUserMessage: string | null;
  session: SessionState | undefined;
  title: string;
};

export type AtlasChatSetupStatus = {
  appReady: boolean;
  authReady: boolean;
  databaseConfigured: boolean;
  databaseReady: boolean;
  databaseSchemaReady: boolean;
  missing: readonly string[];
  rateLimitReady: boolean;
};
