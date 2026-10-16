import type {
  ClientSession,
  HandleMessageStreamEvent,
  SendTurnInput,
  SessionState,
} from "eve/client";

export type PersistedAtlasClientSession = ClientSession & {
  readonly state: SessionState;
  setState: (session: SessionState) => void;
};

type StreamSessionOptions = {
  ignoreLeadingWaiting?: boolean;
  signal?: AbortSignal;
  startIndex?: number;
};

const eveCreateSessionPath = "/eve/v1/session";
const eveSessionIdHeader = "x-eve-session-id";
const streamOpenRetryableStatus = new Set([404, 409, 425, 500, 502, 503, 504]);
const streamDisconnectReconnectAttempts = 3;
const streamIdleTimeoutMs = 120_000;
const streamReconnectDelayMs = 350;

export function createInitialAtlasSessionState(): SessionState {
  return { streamIndex: 0 };
}

export function createPersistedAtlasClientSession({
  initialSession,
  onSessionStarted,
}: {
  initialSession?: SessionState;
  onSessionStarted: (session: SessionState) => Promise<void> | void;
}): PersistedAtlasClientSession {
  let session = initialSession ?? createInitialAtlasSessionState();

  return {
    get state() {
      return session;
    },
    async send(input: SendTurnInput) {
      const previousSession = session;
      const normalizedInput = normalizeSendInput(input);
      const response = await postSessionTurn(previousSession, normalizedInput);
      const startedSession = {
        ...previousSession,
        continuationToken: response.continuationToken ?? previousSession.continuationToken,
        sessionId: response.sessionId,
        streamIndex:
          previousSession.sessionId === response.sessionId
            ? previousSession.streamIndex
            : 0,
      };

      session = startedSession;
      await onSessionStarted(startedSession);

      return createBrowserMessageResponse({
        continuationToken: response.continuationToken,
        ignoreLeadingWaiting:
          Boolean(previousSession.sessionId) &&
          previousSession.sessionId === response.sessionId &&
          startedSession.streamIndex > 0,
        onFinalize: (events) => {
          session = advanceAtlasBrowserSession({
            baseStreamIndex: startedSession.streamIndex,
            continuationToken: response.continuationToken,
            events,
            session: startedSession,
            sessionId: response.sessionId,
          });
        },
        sessionId: response.sessionId,
        signal: normalizedInput.signal,
        startIndex: startedSession.streamIndex,
      });
    },
    stream(options?: StreamSessionOptions) {
      const sessionId = session.sessionId;

      if (!sessionId) {
        throw new Error("Session has no session ID. Send a message first.");
      }

      const startIndex = options?.startIndex ?? session.streamIndex;

      return streamAtlasSessionEvents({
        ignoreLeadingWaiting: options?.ignoreLeadingWaiting,
        onFinalize: (events) => {
          session = advanceAtlasBrowserSession({
            baseStreamIndex: startIndex,
            continuationToken: session.continuationToken,
            events,
            session,
            sessionId,
          });
        },
        sessionId,
        signal: options?.signal,
        startIndex,
      });
    },
    setState(nextSession: SessionState) {
      session = nextSession;
    },
  } as unknown as PersistedAtlasClientSession;
}

export function streamPersistedAtlasClientSession(
  session: PersistedAtlasClientSession,
  options?: StreamSessionOptions,
) {
  const stream = session.stream as unknown as (
    options?: StreamSessionOptions,
  ) => AsyncIterable<HandleMessageStreamEvent>;

  return stream(options);
}

export async function* streamAtlasSessionEvents({
  ignoreLeadingWaiting = false,
  onFinalize,
  sessionId,
  signal,
  startIndex,
}: {
  ignoreLeadingWaiting?: boolean;
  onFinalize: (events: readonly HandleMessageStreamEvent[]) => void;
  sessionId: string;
  signal?: AbortSignal;
  startIndex: number;
}) {
  const events: HandleMessageStreamEvent[] = [];
  let nextIndex = startIndex;
  let disconnectReconnectsRemaining = streamDisconnectReconnectAttempts;
  let lastProgressAt = Date.now();

  try {
    for (;;) {
      let disconnected = false;
      let foundBoundary = false;
      const body = await openStreamBody({ sessionId, signal, startIndex: nextIndex });

      try {
        for await (const event of readNdjsonStream(body)) {
          events.push(event);
          nextIndex += 1;
          lastProgressAt = Date.now();
          disconnectReconnectsRemaining = streamDisconnectReconnectAttempts;
          yield event;

          const staleLeadingWaiting =
            ignoreLeadingWaiting &&
            events.length === 1 &&
            event.type === "session.waiting";

          if (isAtlasTurnBoundaryEvent(event) && !staleLeadingWaiting) {
            foundBoundary = true;
            break;
          }
        }
      } catch (error) {
        if (!isStreamDisconnectError(error)) {
          throw error;
        }

        disconnected = true;
      }

      if (foundBoundary || signal?.aborted) {
        return;
      }

      if (Date.now() - lastProgressAt >= streamIdleTimeoutMs) {
        return;
      }

      if (disconnected) {
        if (disconnectReconnectsRemaining <= 0) {
          return;
        }

        disconnectReconnectsRemaining -= 1;
      }

      await sleep(streamReconnectDelayMs);
    }
  } finally {
    onFinalize(events);
  }
}

function normalizeSendInput(input: SendTurnInput) {
  return typeof input === "string" ? { message: input } : input;
}

async function postSessionTurn(
  session: SessionState,
  input: ReturnType<typeof normalizeSendInput>,
) {
  const body = createHandleMessageBody({ input, session });

  if (!body) {
    throw new Error("Session turn requires a message or input response.");
  }

  const response = await fetch(
    session.sessionId
      ? `/eve/v1/session/${encodeURIComponent(session.sessionId)}`
      : eveCreateSessionPath,
    {
      body: JSON.stringify(body),
      headers: {
        "content-type": "application/json",
        ...input.headers,
      },
      method: "POST",
      signal: input.signal ?? null,
    },
  );

  if (!response.ok) {
    throw new Error(await readResponseError(response));
  }

  const payload = (await response.json()) as {
    continuationToken?: unknown;
    sessionId?: unknown;
  };
  const sessionId =
    (typeof payload.sessionId === "string" ? payload.sessionId : undefined) ??
    response.headers.get(eveSessionIdHeader)?.trim();

  if (!sessionId) {
    throw new Error("Message route did not return a session id.");
  }

  return {
    continuationToken:
      typeof payload.continuationToken === "string"
        ? payload.continuationToken
        : undefined,
    sessionId,
  };
}

function createHandleMessageBody({
  input,
  session,
}: {
  input: ReturnType<typeof normalizeSendInput>;
  session: SessionState;
}) {
  const body: Record<string, unknown> = {};

  if (input.message !== undefined) {
    body.message = input.message;
  }

  if (input.inputResponses !== undefined && input.inputResponses.length > 0) {
    body.inputResponses = input.inputResponses;
  }

  if (input.clientContext !== undefined) {
    body.clientContext = input.clientContext;
  }

  if (input.outputSchema !== undefined) {
    body.outputSchema = input.outputSchema;
  }

  if (session.continuationToken !== undefined) {
    body.continuationToken = session.continuationToken;
  }

  if (Object.keys(body).length === 0) {
    return null;
  }

  if (session.continuationToken === undefined && body.message === undefined) {
    return null;
  }

  if (
    session.continuationToken !== undefined &&
    body.message === undefined &&
    body.inputResponses === undefined
  ) {
    return null;
  }

  return body;
}

function createBrowserMessageResponse({
  continuationToken,
  ignoreLeadingWaiting = false,
  onFinalize,
  sessionId,
  signal,
  startIndex,
}: {
  continuationToken?: string;
  ignoreLeadingWaiting?: boolean;
  onFinalize: (events: readonly HandleMessageStreamEvent[]) => void;
  sessionId: string;
  signal?: AbortSignal;
  startIndex: number;
}) {
  let consumed = false;

  return {
    continuationToken,
    sessionId,
    [Symbol.asyncIterator]() {
      if (consumed) {
        throw new Error("MessageResponse has already been consumed.");
      }

      consumed = true;

      return streamAtlasSessionEvents({
        ignoreLeadingWaiting,
        onFinalize,
        sessionId,
        signal,
        startIndex,
      })[Symbol.asyncIterator]();
    },
  };
}

async function openStreamBody({
  sessionId,
  signal,
  startIndex,
}: {
  sessionId: string;
  signal?: AbortSignal;
  startIndex: number;
}) {
  const path = `/eve/v1/session/${encodeURIComponent(sessionId)}/stream`;
  const query =
    startIndex > 0 ? `?${new URLSearchParams({ startIndex: String(startIndex) })}` : "";
  let status = 0;
  let body = "Failed to open message stream.";

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const response = await fetch(`${path}${query}`, {
      signal: signal ?? null,
    });

    if (response.ok) {
      if (!response.body) {
        throw new Error("Response body is null.");
      }

      return response.body;
    }

    status = response.status;
    body = await response.text();

    if (!streamOpenRetryableStatus.has(response.status)) {
      throw new Error(formatResponseError(status, body));
    }

    if (attempt < 11) {
      await sleep(250);
    }
  }

  throw new Error(formatResponseError(status, body));
}

async function* readNdjsonStream(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) {
        buffer += decoder.decode();
        break;
      }

      if (value) {
        buffer += decoder.decode(value, { stream: true });
      }

      let newlineIndex = buffer.indexOf("\n");

      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);

        if (line.length > 0) {
          yield JSON.parse(line) as HandleMessageStreamEvent;
        }

        newlineIndex = buffer.indexOf("\n");
      }
    }

    const line = buffer.trim();

    if (line.length > 0) {
      yield JSON.parse(line) as HandleMessageStreamEvent;
    }
  } finally {
    reader.releaseLock();
  }
}

function advanceAtlasBrowserSession({
  baseStreamIndex,
  continuationToken,
  events,
  session,
  sessionId,
}: {
  baseStreamIndex: number;
  continuationToken?: string;
  events: readonly HandleMessageStreamEvent[];
  session: SessionState;
  sessionId: string;
}) {
  const boundary = findBoundaryEvent(events);

  if (boundary?.type === "session.waiting") {
    return {
      continuationToken: continuationToken ?? session.continuationToken,
      sessionId,
      streamIndex: baseStreamIndex + events.length,
    };
  }

  const lastEvent = events.at(-1);

  if (lastEvent?.type === "authorization.required") {
    return {
      continuationToken: continuationToken ?? session.continuationToken,
      sessionId,
      streamIndex: baseStreamIndex + events.length,
    };
  }

  return createInitialAtlasSessionState();
}

function findBoundaryEvent(events: readonly HandleMessageStreamEvent[]) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];

    if (event && isAtlasTurnBoundaryEvent(event)) {
      return event;
    }
  }
}

function isAtlasTurnBoundaryEvent(event: HandleMessageStreamEvent) {
  return (
    event.type === "session.completed" ||
    event.type === "session.failed" ||
    event.type === "session.waiting" ||
    event.type === "authorization.required"
  );
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function isStreamDisconnectError(error: unknown) {
  if (isAbortError(error)) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  const code =
    "code" in error && typeof error.code === "string" ? error.code : undefined;

  return (
    error.name === "AbortError" ||
    error.message === "terminated" ||
    code === "UND_ERR_SOCKET" ||
    /abort|cancel|disconnect|premature close|socket|terminated/i.test(error.message)
  );
}

async function readResponseError(response: Response) {
  return formatResponseError(response.status, await response.text());
}

function formatResponseError(status: number, body: string) {
  if (body.length > 0) {
    try {
      const parsed = JSON.parse(body) as { error?: unknown };

      if (typeof parsed.error === "string") {
        return parsed.error;
      }
    } catch {}

    return body;
  }

  return `Server returned ${status}.`;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
