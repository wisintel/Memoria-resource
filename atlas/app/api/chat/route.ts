import { convertToModelMessages, streamText, type UIMessage } from "ai";

import {
  defaultAtlasChatEffort,
  defaultAtlasChatModelId,
  findAtlasChatModelOption,
  isAtlasChatEffort,
  providerOptionsForAtlasChatModel,
  type AtlasChatEffort,
  type AtlasChatModelOption,
} from "@/lib/atlas-ai-models";
import type { ChatContext } from "@/lib/chat-context";

export const maxDuration = 60;

const maxContextStringLength = 2_000;
const maxMessageCount = 100;
const maxMessagesJsonLength = 400_000;

function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

function clampedString(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  return value.slice(0, maxContextStringLength);
}

function sanitizeContext(value: unknown): ChatContext {
  if (value === null || typeof value !== "object") {
    return {};
  }

  const raw = value as Record<string, unknown>;

  return {
    activeDocumentShardId: clampedString(raw.activeDocumentShardId),
    documentId: clampedString(raw.documentId),
    documentTitle: clampedString(raw.documentTitle),
    domainId: clampedString(raw.domainId),
    domainName: clampedString(raw.domainName),
    mode: clampedString(raw.mode),
    route: clampedString(raw.route),
    screen: clampedString(raw.screen),
    selectedRecordId: clampedString(raw.selectedRecordId),
    selectedRecordTable: clampedString(raw.selectedRecordTable),
  };
}

function contextLine(label: string, value: string | null | undefined) {
  return typeof value === "string" && value.length > 0 ? `${label}: ${value}.` : null;
}

function isMessageShaped(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { role?: unknown }).role === "string" &&
    Array.isArray((value as { parts?: unknown }).parts)
  );
}

function configuredDefaultModelId() {
  return process.env.ATLAS_AI_MODEL ?? process.env.MEMORIA_AI_MODEL ?? defaultAtlasChatModelId;
}

function sanitizeModelSettings(value: unknown): {
  effort: AtlasChatEffort;
  modelId: string;
  modelOption: AtlasChatModelOption | null;
} {
  if (value === null || typeof value !== "object") {
    const modelId = configuredDefaultModelId();

    return {
      effort: defaultAtlasChatEffort,
      modelId,
      modelOption: findAtlasChatModelOption(modelId),
    };
  }

  const raw = value as Record<string, unknown>;
  const modelId = typeof raw.model === "string" ? raw.model : null;
  const modelOption = findAtlasChatModelOption(modelId);

  if (!modelOption) {
    const fallbackModelId = configuredDefaultModelId();

    return {
      effort: defaultAtlasChatEffort,
      modelId: fallbackModelId,
      modelOption: findAtlasChatModelOption(fallbackModelId),
    };
  }

  const effort =
    isAtlasChatEffort(raw.effort) && modelOption.effortOptions.includes(raw.effort)
      ? raw.effort
      : defaultAtlasChatEffort;

  return {
    effort,
    modelId: modelOption.id,
    modelOption,
  };
}

export async function POST(req: Request) {
  if (process.env.NODE_ENV !== "production" && !process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    return Response.json(
      {
        error: "Atlas AI is not configured. Add AI_GATEWAY_API_KEY or refresh Vercel OIDC credentials.",
      },
      { status: 503 },
    );
  }

  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  if (body === null || typeof body !== "object") {
    return badRequest("Request body must be a JSON object.");
  }

  const { context: rawContext, messages: rawMessages, modelSettings: rawModelSettings } = body as {
    context?: unknown;
    messages?: unknown;
    modelSettings?: unknown;
  };

  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    return badRequest("messages must be a non-empty array.");
  }

  if (rawMessages.length > maxMessageCount) {
    return badRequest(`messages must contain at most ${maxMessageCount} entries.`);
  }

  if (!rawMessages.every(isMessageShaped)) {
    return badRequest("Each message needs a role and a parts array.");
  }

  if (JSON.stringify(rawMessages).length > maxMessagesJsonLength) {
    return badRequest("messages payload is too large.");
  }

  const messages = rawMessages as UIMessage[];
  const context = sanitizeContext(rawContext);
  const modelSettings = sanitizeModelSettings(rawModelSettings);
  const providerOptions = modelSettings.modelOption
    ? providerOptionsForAtlasChatModel(modelSettings.modelOption, modelSettings.effort)
    : undefined;
  const contextLines = [
    contextLine("Current route", context.route),
    contextLine("Current screen", context.screen),
    contextLine("Current curation mode", context.mode),
    contextLine("Selected domain", context.domainName),
    contextLine("Selected domain id", context.domainId),
    contextLine("Selected document", context.documentTitle),
    contextLine("Selected document id", context.documentId),
    contextLine("Active document shard id", context.activeDocumentShardId),
    contextLine("Selected record table", context.selectedRecordTable),
    contextLine("Selected record id", context.selectedRecordId),
  ].filter((line): line is string => line !== null);

  const result = streamText({
    model: modelSettings.modelId,
    ...(providerOptions ? { providerOptions } : {}),
    system: [
      "You are Atlas, a calm knowledge-work assistant inside a source-backed graph workbench.",
      "Help the user shape durable knowledge from source material into inspectable structure.",
      "Treat entities, claims, relationships, and graph changes as proposed structure unless the user explicitly approves promotion or creation.",
      "Be concise, ask focused questions when context is missing, and do not claim that records were created unless a tool or server action confirms it.",
      ...contextLines,
    ].join("\n"),
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
