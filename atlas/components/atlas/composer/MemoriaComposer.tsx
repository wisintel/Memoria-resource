"use client";

import {
  createAtlasDocument,
  createAtlasEntity,
} from "@/app/atlas/actions";
import type {
  EveAgentStoreSnapshot,
  EveMessageData,
  HandleMessageStreamEvent,
  SessionState,
} from "eve/client";
import { useEveAgent } from "eve/react";
import {
  ArrowUp,
  Check,
  History,
  Plus,
  RotateCcw,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type RefObject,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

import type { ChatContext } from "@/lib/chat-context";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  PromptInput,
  PromptInputButton,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type MemoriaComposerProps = {
  activeStageModeId: string;
  context: ChatContext;
  documentContext?: DocumentIntakeContext;
  documentIntakeActionsRef?: RefObject<DocumentIntakeActions | null>;
  entityContext?: EntityComposerContext;
  initialMessage: string;
  onStageModeChange: (modeId: string) => void;
  stageModes: StageModeOption[];
};

export type StageModeOption = {
  id: string;
  title: string;
  Icon: LucideIcon;
};

export type EntityComposerOption = {
  domainId?: string | null;
  label: string;
  slug?: string | null;
  typeId?: string | null;
  value: string;
};

export type EntityComposerContext = {
  domainId: string | null;
  domainLabel: string | null;
  kinds: EntityComposerOption[];
  statuses: EntityComposerOption[];
  types: EntityComposerOption[];
};

export type DocumentIntakeContext = {
  domainId: string | null;
  domainLabel: string | null;
};

export type DocumentIntakeActions = {
  upload: () => void;
};

type DocumentSourceType = "html" | "markdown";

type DocumentIntakeDraft = {
  kind: "file";
  content: string;
  mimeType: string | null;
  sizeBytes: number;
  sourceFilename: string;
  sourceType: DocumentSourceType;
  title: string;
};

type SourceActivity = {
  detail: string;
  title: string;
};

type EntityDraft = {
  label: string;
  statusId: string;
  typeId: string;
};

const eveComposerSessionStorageKeyPrefix = "atlas:eve-composer-session";
const eveComposerEventStorageKeyPrefix = "atlas:eve-composer-events";
const eveStoredEventLimit = 500;
const mutationToolNames = new Set([
  "add_record_to_view",
  "change_status",
  "create_claim",
  "create_entity",
  "create_relationship",
]);
const noneStatusValue = "__none_status";
const emptyEntityContext: EntityComposerContext = {
  domainId: null,
  domainLabel: null,
  kinds: [],
  statuses: [],
  types: [],
};
const emptyDocumentContext: DocumentIntakeContext = {
  domainId: null,
  domainLabel: null,
};
const composerDockClassName =
  "pointer-events-none absolute inset-x-0 bottom-6 z-20 flex flex-col items-center";
const composerFrameClassName =
  "pointer-events-auto relative w-[min(700px,calc(100%_-_56px))] max-shell:w-[min(520px,calc(100%_-_32px))]";
const composerShellClassName =
  "relative min-h-[116px] w-full overflow-hidden rounded-xl bg-card text-card-foreground shadow-sm ring-1 ring-foreground/10";

export function MemoriaComposer(props: MemoriaComposerProps) {
  const eveSessionScope = eveComposerSessionScope(props.context);

  return (
    <MemoriaComposerSession
      {...props}
      key={eveSessionScope}
      eveEventStorageKey={`${eveComposerEventStorageKeyPrefix}:${eveSessionScope}`}
      eveSessionStorageKey={`${eveComposerSessionStorageKeyPrefix}:${eveSessionScope}`}
    />
  );
}

function MemoriaComposerSession({
  activeStageModeId,
  context,
  documentContext = emptyDocumentContext,
  documentIntakeActionsRef,
  eveEventStorageKey,
  eveSessionStorageKey,
  entityContext = emptyEntityContext,
  initialMessage,
  onStageModeChange,
  stageModes,
}: MemoriaComposerProps & {
  eveEventStorageKey: string;
  eveSessionStorageKey: string;
}) {
  const [input, setInput] = useState("");
  const [entityDraft, setEntityDraft] = useState<EntityDraft | null>(null);
  const [documentDraft, setDocumentDraft] =
    useState<DocumentIntakeDraft | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [intakeError, setIntakeError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sourceActivity, setSourceActivity] = useState<SourceActivity | null>(
    null,
  );
  const [initialAgentSession] = useState(() =>
    readStoredEveSession(eveSessionStorageKey),
  );
  const [initialAgentEvents] = useState(() =>
    readStoredEveEvents(eveEventStorageKey),
  );
  const [isPreparingSource, setIsPreparingSource] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const composerRootRef = useRef<HTMLElement>(null);
  const staleEveSessionResetRef = useRef(false);
  const [isCreatingEntity, startCreateEntityTransition] = useTransition();
  const [isImportingDocument, startImportDocumentTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const agent = useEveAgent({
    initialEvents: initialAgentEvents,
    initialSession: initialAgentSession,
    onFinish: (snapshot) => {
      storeEveEvents(eveEventStorageKey, snapshot.events);

      if (snapshotHasSuccessfulMutation(snapshot)) {
        router.refresh();
      }
    },
    onSessionChange: (session) => storeEveSession(eveSessionStorageKey, session),
    prepareSend: (turn) => ({
      ...turn,
      clientContext: context,
    }),
  });
  const { messages } = agent.data;
  const { error, send, status } = agent;
  const isSubmitting = status === "submitted" || status === "streaming";
  const selectedType = entityContext.types.find(
    (option) => option.value === entityDraft?.typeId,
  );
  const selectedStatus = entityContext.statuses.find(
    (option) => option.value === entityDraft?.statusId,
  );
  const composerBusy = isSubmitting || isPreparingSource || isImportingDocument;

  useEffect(() => {
    clearLegacyLocalEveStorage(eveSessionStorageKey);
    clearLegacyLocalEveStorage(eveEventStorageKey);
  }, [eveEventStorageKey, eveSessionStorageKey]);

  useEffect(() => {
    if (!error) {
      staleEveSessionResetRef.current = false;
      return;
    }

    if (
      staleEveSessionResetRef.current ||
      !isStaleEveSessionError(error)
    ) {
      return;
    }

    staleEveSessionResetRef.current = true;
    clearStoredEveSession(eveSessionStorageKey);
    clearStoredEveEvents(eveEventStorageKey);
    agent.reset();
    setNotice("Atlas reconnected after the dev server reset. Send that again when you're ready.");
    setTranscriptOpen(true);
  }, [agent, error, eveEventStorageKey, eveSessionStorageKey]);

  useEffect(() => {
    if (!transcriptOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (composerRootRef.current?.contains(target)) {
        return;
      }

      setTranscriptOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [transcriptOpen]);

  async function handlePromptSubmit(message: PromptInputMessage) {
    const text = message.text.trim();

    if (!text || isSubmitting) {
      return;
    }

    const entityLabel = parseEntityCreateIntent(text);

    if (entityLabel) {
      beginEntityDraft(entityLabel);
      setInput("");
      setTranscriptOpen(true);
      return;
    }

    setInput("");
    setTranscriptOpen(true);
    await send({ message: text });
  }

  function resetAgentSession() {
    clearStoredEveSession(eveSessionStorageKey);
    clearStoredEveEvents(eveEventStorageKey);
    agent.reset();
    setEntityDraft(null);
    setDocumentDraft(null);
    setDraftError(null);
    setIntakeError(null);
    setSourceActivity(null);
    setNotice("Atlas session reset.");
    setTranscriptOpen(true);
  }

  function beginEntityDraft(label: string) {
    setNotice(null);

    if (!entityContext.domainId) {
      setEntityDraft(null);
      setDraftError("Select a domain before creating an entity.");
      return;
    }

    const classification = defaultEntityClassification(entityContext);

    setEntityDraft({
      label,
      statusId: classification.statusId,
      typeId: classification.typeId,
    });
    setDraftError(entityDraftSetupError(classification));
  }

  function updateEntityDraftType(typeId: string) {
    setEntityDraft((draft) => {
      if (!draft) {
        return draft;
      }

      return {
        ...draft,
        typeId,
      };
    });
    setDraftError(null);
  }

  function createDraftEntity() {
    if (!entityDraft || !entityContext.domainId || isCreatingEntity) {
      return;
    }

    const domainId = entityContext.domainId;

    if (!entityDraft.label.trim()) {
      setDraftError("Entity label is required.");
      return;
    }

    if (!entityDraft.typeId) {
      setDraftError("Entity type is required before creation.");
      return;
    }

    startCreateEntityTransition(async () => {
      const result = await createAtlasEntity({
        domainId,
        kindId: null,
        label: entityDraft.label,
        statusId: entityDraft.statusId || null,
        typeId: entityDraft.typeId,
      });

      if (!result.ok) {
        setDraftError(result.error ?? "Entity could not be created.");
        return;
      }

      setEntityDraft(null);
      setDraftError(null);
      setNotice(`Created entity: ${entityDraft.label}`);
      router.refresh();
    });
  }

  async function handleSourceClick() {
    setNotice(null);
    setDraftError(null);
    setIntakeError(null);
    setSourceActivity(null);
    setEntityDraft(null);
    setTranscriptOpen(true);
    prepareUploadIntake();
  }

  function prepareUploadIntake() {
    if (!documentContext.domainId) {
      setDocumentDraft(null);
      setTranscriptOpen(true);
      setIntakeError("Select a domain before importing source material.");
      return;
    }

    setIntakeError(null);
    fileInputRef.current?.click();
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;

    event.currentTarget.value = "";

    if (!file) {
      return;
    }

    setNotice(null);
    setDraftError(null);
    setIntakeError(null);
    setSourceActivity(null);
    setEntityDraft(null);
    setTranscriptOpen(true);

    if (!documentContext.domainId) {
      setDocumentDraft(null);
      setIntakeError("Select a domain before importing source material.");
      return;
    }

    setIsPreparingSource(true);

    try {
      if (isMarkdownFile(file) || isHtmlFile(file)) {
        const sourceType = isHtmlFile(file) ? "html" : "markdown";
        setSourceActivity({
          detail: file.name,
          title: "Reading file",
        });
        const content = await file.text();

        setDocumentDraft({
          kind: "file",
          content,
          mimeType: file.type || mimeTypeForDraftSource(sourceType),
          sizeBytes: byteCount(content),
          sourceFilename: file.name,
          sourceType,
          title: titleFromFileName(file.name),
        });
        return;
      }

      setDocumentDraft(null);
      setIntakeError("Only Markdown and HTML files can be imported.");
    } catch (error) {
      setDocumentDraft(null);
      setIntakeError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsPreparingSource(false);
      setSourceActivity(null);
    }
  }

  function importDocumentDraft() {
    if (!documentDraft || !documentContext.domainId || isImportingDocument) {
      return;
    }

    const domainId = documentContext.domainId;

    startImportDocumentTransition(async () => {
      setSourceActivity({
        detail: documentDraft.title,
        title: "Importing source",
      });
      const result =
        await createAtlasDocument({
          content: documentDraft.content,
          domainId,
          mimeType: documentDraft.mimeType,
          sourceFilename: documentDraft.sourceFilename,
          sourceType: documentDraft.sourceType,
          title: documentDraft.title,
        });

      if (!result.ok) {
        setSourceActivity(null);
        setIntakeError(result.error ?? "Document could not be imported.");
        return;
      }

      setSourceActivity(null);
      setDocumentDraft(null);
      setIntakeError(null);
      setInput("");
      setNotice(
        result.deduped
          ? "Source already exists in this domain."
          : `Imported document: ${documentDraft.title}`,
      );
      router.refresh();
    });
  }

  useEffect(() => {
    if (!documentIntakeActionsRef) {
      return;
    }

    documentIntakeActionsRef.current = {
      upload: prepareUploadIntake,
    };

    return () => {
      documentIntakeActionsRef.current = null;
    };
  });

  return (
    <section
      className={composerDockClassName}
      aria-label="Atlas composer"
      ref={composerRootRef}
    >
      <Collapsible
        className="flex w-full flex-col items-center"
        open={transcriptOpen}
        onOpenChange={setTranscriptOpen}
      >
        <CollapsibleContent
          className="pointer-events-auto mb-2 w-[min(700px,calc(100%_-_56px))] overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm max-shell:w-[min(520px,calc(100%_-_32px))]"
          id="atlas-composer-transcript"
        >
          <Conversation className="h-[min(360px,44vh)]">
            <ConversationContent className="gap-4 p-4">
              {messages.length === 0 ? (
                <ComposerTranscriptMessage from="assistant" speaker="Atlas">
                  <MessageResponse>{initialMessage}</MessageResponse>
                </ComposerTranscriptMessage>
              ) : (
                messages.map((message) => (
                  <ComposerTranscriptMessage
                    from={message.role}
                    key={message.id}
                    speaker={message.role === "user" ? "You" : "Atlas"}
                  >
                    {message.parts.map((part, index) =>
                      part.type === "text" ? (
                        <MessageResponse key={`${message.id}-${index}`}>
                          {part.text}
                        </MessageResponse>
                      ) : null,
                    )}
                  </ComposerTranscriptMessage>
                ))
              )}

              {notice ? (
                <ComposerTranscriptMessage from="assistant" speaker="Atlas">
                  <MessageResponse>{notice}</MessageResponse>
                </ComposerTranscriptMessage>
              ) : null}

              {error ? (
                <ComposerTranscriptMessage
                  from="assistant"
                  speaker="Atlas"
                  tone="destructive"
                >
                  <MessageResponse>{error.message}</MessageResponse>
                </ComposerTranscriptMessage>
              ) : null}

              {draftError && !entityDraft ? (
                <ComposerTranscriptMessage
                  from="assistant"
                  speaker="Atlas"
                  tone="destructive"
                >
                  <MessageResponse>{draftError}</MessageResponse>
                </ComposerTranscriptMessage>
              ) : null}

              {intakeError && !documentDraft ? (
                <ComposerTranscriptMessage
                  from="assistant"
                  speaker="Atlas"
                  tone="destructive"
                >
                  <MessageResponse>{intakeError}</MessageResponse>
                </ComposerTranscriptMessage>
              ) : null}

              {sourceActivity ? (
                <Card
                  className="w-[min(100%,520px)] max-w-[min(100%,520px)] self-start"
                  size="sm"
                >
                  <CardHeader>
                    <CardTitle>{sourceActivity.title}</CardTitle>
                    <CardDescription className="break-words">
                      {sourceActivity.detail}
                    </CardDescription>
                    <CardAction>
                      <Spinner />
                    </CardAction>
                  </CardHeader>
                </Card>
              ) : null}

              {documentDraft ? (
                <Card
                  className="w-[min(100%,560px)] max-w-[min(100%,560px)] self-start"
                  size="sm"
                >
                  <CardHeader>
                    <CardTitle>{documentDraft.title}</CardTitle>
                    <CardDescription>
                      {documentContext.domainLabel ?? "Current domain"}
                    </CardDescription>
                    <CardAction>
                      <Button
                        aria-label="Cancel source import"
                        disabled={isImportingDocument}
                        onClick={() => {
                          setDocumentDraft(null);
                          setIntakeError(null);
                        }}
                        size="icon-sm"
                        title="Cancel"
                        type="button"
                        variant="ghost"
                      >
                        <X aria-hidden={true} />
                      </Button>
                    </CardAction>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <FieldGroup className="gap-3">
                      <ComposerPreviewField
                        label="Type"
                        value={sourceTypeLabel(documentDraft.sourceType)}
                      />
                      <ComposerPreviewField
                        label="Size"
                        value={formatBytes(documentDraft.sizeBytes)}
                      />
                      <ComposerPreviewField
                        label="File"
                        value={documentDraft.sourceFilename}
                      />
                    </FieldGroup>

                    {intakeError ? (
                      <FieldError>{intakeError}</FieldError>
                    ) : null}
                  </CardContent>

                  <CardFooter className="justify-end gap-2">
                    <Button
                      disabled={isImportingDocument}
                      onClick={() => {
                        setDocumentDraft(null);
                        setIntakeError(null);
                      }}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Cancel
                    </Button>
                    <Button
                      disabled={isImportingDocument}
                      onClick={importDocumentDraft}
                      size="sm"
                      type="button"
                    >
                      <Check aria-hidden={true} data-icon="inline-start" />
                      {isImportingDocument ? "Importing" : "Import"}
                    </Button>
                  </CardFooter>
                </Card>
              ) : null}

              {entityDraft ? (
                <Card
                  className="w-[min(100%,560px)] max-w-[min(100%,560px)] self-start"
                  size="sm"
                >
                  <CardHeader>
                    <CardTitle>{entityDraft.label}</CardTitle>
                    <CardDescription>
                      {entityContext.domainLabel ?? "Current domain"}
                    </CardDescription>
                    <CardAction>
                      <Button
                        aria-label="Cancel entity draft"
                        disabled={isCreatingEntity}
                        onClick={() => {
                          setEntityDraft(null);
                          setDraftError(null);
                        }}
                        size="icon-sm"
                        title="Cancel"
                        type="button"
                        variant="ghost"
                      >
                        <X aria-hidden={true} />
                      </Button>
                    </CardAction>
                  </CardHeader>

                  <CardContent className="flex flex-col gap-3">
                    <div className="grid grid-cols-2 gap-2 max-shell:grid-cols-1">
                      <ComposerSelect
                        disabled={
                          isCreatingEntity || entityContext.types.length === 0
                        }
                        label="Type"
                        onValueChange={updateEntityDraftType}
                        options={entityContext.types}
                        selectedLabel={selectedType?.label ?? "Select type"}
                        value={entityDraft.typeId}
                      />
                      <ComposerSelect
                        disabled={
                          isCreatingEntity || entityContext.statuses.length === 0
                        }
                        label="Status"
                        onValueChange={(statusId) => {
                          setEntityDraft((draft) =>
                            draft ? { ...draft, statusId } : draft,
                          );
                          setDraftError(null);
                        }}
                        options={entityContext.statuses}
                        selectedLabel={selectedStatus?.label ?? "None"}
                        value={entityDraft.statusId}
                      />
                    </div>

                    {draftError ? <FieldError>{draftError}</FieldError> : null}
                  </CardContent>

                  <CardFooter className="justify-end gap-2">
                    <Button
                      disabled={isCreatingEntity}
                      onClick={() => {
                        setEntityDraft(null);
                        setDraftError(null);
                      }}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Cancel
                    </Button>
                    <Button
                      disabled={
                        isCreatingEntity ||
                        !entityDraft.typeId ||
                        !entityDraft.statusId
                      }
                      onClick={createDraftEntity}
                      size="sm"
                      type="button"
                    >
                      <Check aria-hidden={true} data-icon="inline-start" />
                      {isCreatingEntity ? "Creating" : "Create"}
                    </Button>
                  </CardFooter>
                </Card>
              ) : null}
            </ConversationContent>
            <ConversationScrollButton size="icon-sm" />
          </Conversation>
        </CollapsibleContent>

        <input
          accept=".htm,.html,.md,.markdown,text/html,text/markdown"
          aria-hidden={true}
          className="hidden"
          onChange={handleFileChange}
          ref={fileInputRef}
          tabIndex={-1}
          type="file"
        />
        <div className={composerFrameClassName}>
          <PromptInput
            className={composerShellClassName}
            onSubmit={handlePromptSubmit}
          >
            <button
              aria-controls="atlas-composer-transcript"
              aria-expanded={transcriptOpen}
              aria-label={transcriptOpen ? "Hide transcript" : "Show transcript"}
              className="absolute top-2 left-1/2 z-[5] h-2.5 w-16 -translate-x-1/2 rounded-full border border-border/55 bg-background/90 opacity-70 shadow-[inset_0_1px_0_rgb(255_255_255_/_8%)] transition-[opacity,box-shadow,background-color,border-color] hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 data-[open=true]:border-primary/45 data-[open=true]:bg-[color-mix(in_oklch,var(--primary)_28%,var(--background)_72%)] data-[open=true]:opacity-100 data-[open=true]:shadow-[0_0_18px_color-mix(in_oklch,var(--primary)_60%,transparent),inset_0_1px_0_rgb(255_255_255_/_14%)]"
              data-open={transcriptOpen}
              onClick={() => setTranscriptOpen((open) => !open)}
              title={transcriptOpen ? "Hide transcript" : "Show transcript"}
              type="button"
            />
            <PromptInputTextarea
              attachmentPaste={false}
              aria-label="Message Atlas"
              className="min-h-[76px] pt-5"
              disabled={composerBusy}
              onChange={(event) => setInput(event.currentTarget.value)}
              onFocus={() => setTranscriptOpen(true)}
              placeholder="ATLAS"
              rows={3}
              value={input}
            />

            <PromptInputFooter className="border-t px-4 py-3 max-shell:flex-col max-shell:items-start">
              <PromptInputTools className="max-shell:w-full max-shell:flex-wrap">
                <PromptInputButton
                  aria-label={
                    "Upload document"
                  }
                  disabled={composerBusy}
                  onClick={handleSourceClick}
                  size="icon-sm"
                  title={
                    "Upload document"
                  }
                  type="button"
                  variant="outline"
                >
                  <Plus aria-hidden={true} />
                </PromptInputButton>
                <PromptInputButton
                  aria-controls="atlas-composer-transcript"
                  aria-expanded={transcriptOpen}
                  aria-label={
                    transcriptOpen ? "Hide transcript" : "Show transcript"
                  }
                  onClick={() => setTranscriptOpen((open) => !open)}
                  size="icon-sm"
                  title={transcriptOpen ? "Hide transcript" : "Show transcript"}
                  type="button"
                  variant="outline"
                >
                  <History aria-hidden={true} />
                </PromptInputButton>
                <PromptInputButton
                  aria-label="Reset Atlas session"
                  disabled={composerBusy}
                  onClick={resetAgentSession}
                  size="icon-sm"
                  title="Reset Atlas session"
                  type="button"
                  variant="outline"
                >
                  <RotateCcw aria-hidden={true} />
                </PromptInputButton>
              </PromptInputTools>

              <PromptInputTools className="max-shell:w-full max-shell:justify-between">
                <PromptInputTools aria-label="Stage view">
                  {stageModes.map((mode) => {
                    const Icon = mode.Icon;
                    const active = mode.id === activeStageModeId;

                    return (
                      <PromptInputButton
                        aria-label={mode.title}
                        aria-pressed={active}
                        key={mode.id}
                        onClick={() => onStageModeChange(mode.id)}
                        size="icon-sm"
                        title={mode.title}
                        type="button"
                        variant={active ? "default" : "outline"}
                      >
                        <Icon aria-hidden={true} />
                      </PromptInputButton>
                    );
                  })}
                </PromptInputTools>
                <PromptInputSubmit
                  aria-label="Send message"
                  disabled={isSubmitting || !input.trim()}
                  size="icon-sm"
                  status={status}
                >
                  <ArrowUp aria-hidden={true} />
                </PromptInputSubmit>
              </PromptInputTools>
            </PromptInputFooter>
          </PromptInput>
        </div>
      </Collapsible>
    </section>
  );
}

function ComposerTranscriptMessage({
  children,
  from,
  speaker,
  tone = "default",
}: {
  children: ReactNode;
  from: "assistant" | "system" | "user";
  speaker: string;
  tone?: "default" | "destructive";
}) {
  const isDestructive = tone === "destructive";

  return (
    <Message
      from={from}
      className={cn(
        "max-w-[88%]",
        from === "user" ? "items-end self-end" : "items-start self-start",
      )}
    >
      <Badge
        variant={
          isDestructive
            ? "destructive"
            : from === "user"
              ? "secondary"
              : "outline"
        }
      >
        {speaker}
      </Badge>
      <MessageContent className={cn(isDestructive && "text-destructive")}>
        {children}
      </MessageContent>
    </Message>
  );
}

function ComposerSelect({
  disabled,
  label,
  noneLabel,
  onValueChange,
  options,
  selectedLabel,
  value,
}: {
  disabled?: boolean;
  label: string;
  noneLabel?: string;
  onValueChange: (value: string) => void;
  options: EntityComposerOption[];
  selectedLabel: string;
  value: string;
}) {
  const selectValue = value || (noneLabel ? noneStatusValue : "");

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select
        value={selectValue}
        onValueChange={(nextValue) => {
          if (nextValue !== null) {
            onValueChange(nextValue === noneStatusValue ? "" : nextValue);
          }
        }}
      >
        <SelectTrigger
          aria-label={label}
          className="w-full min-w-0"
          disabled={disabled || (!noneLabel && options.length === 0)}
        >
          <SelectValue placeholder={label}>{() => selectedLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {noneLabel ? (
              <SelectItem value={noneStatusValue}>{noneLabel}</SelectItem>
            ) : null}
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

function ComposerPreviewField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <Field className="gap-1">
      <FieldLabel>{label}</FieldLabel>
      <FieldDescription className="break-words text-foreground">
        {value}
      </FieldDescription>
    </Field>
  );
}

function parseEntityCreateIntent(text: string) {
  const patterns = [
    /^(?:create|add|new)\s+(?:an?\s+)?entity(?:\s+(?:called|named))?\s+(.+)$/i,
    /^(?:create|add|new)\s+(.+)\s+as\s+(?:an?\s+)?entity$/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const label = cleanDraftLabel(match?.[1] ?? "");

    if (label) {
      return label;
    }
  }

  return null;
}

function cleanDraftLabel(value: string) {
  return value
    .trim()
    .replace(/^["'`]+|["'`.]+$/g, "")
    .replace(/\s+/g, " ");
}

function defaultEntityClassification(entityContext: EntityComposerContext) {
  const proposedStatus = entityContext.statuses.find((status) => status.slug === "proposed") ?? null;
  const typeId = entityContext.types[0]?.value || "";

  return {
    statusId: proposedStatus?.value ?? "",
    typeId,
  };
}

function entityDraftSetupError(classification: { statusId: string; typeId: string }) {
  if (!classification.typeId) {
    return "Entity creation needs an entity type first.";
  }

  if (!classification.statusId) {
    return "Entity creation needs the Proposed status first.";
  }

  return null;
}

function isMarkdownFile(file: File) {
  return (
    /\.(md|markdown)$/i.test(file.name) ||
    file.type === "text/markdown"
  );
}

function isHtmlFile(file: File) {
  return (
    /\.(html|htm)$/i.test(file.name) ||
    file.type === "text/html"
  );
}

function mimeTypeForDraftSource(sourceType: DocumentSourceType) {
  switch (sourceType) {
    case "html":
      return "text/html";
    case "markdown":
      return "text/markdown";
  }
}

function titleFromFileName(fileName: string) {
  return (
    fileName
      .replace(/\.[^.]+$/i, "")
      .replaceAll(/[-_]+/g, " ")
      .trim() || "Untitled document"
  );
}

function sourceTypeLabel(value: DocumentSourceType) {
  switch (value) {
    case "html":
      return "HTML";
    case "markdown":
      return "Markdown";
  }
}

function eveComposerSessionScope(context: ChatContext) {
  return [
    contextScopePart("domain", context.domainId),
    contextScopePart("view", context.viewId),
    contextScopePart("document", context.documentId),
  ].join(":");
}

function contextScopePart(label: string, value: string | null | undefined) {
  return `${label}=${encodeURIComponent(value ?? "none")}`;
}

function readStoredEveSession(storageKey: string): SessionState | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  const stored = window.sessionStorage.getItem(storageKey);

  if (!stored) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(stored) as Partial<SessionState>;

    if (typeof parsed.streamIndex !== "number") {
      return undefined;
    }

    return {
      continuationToken:
        typeof parsed.continuationToken === "string"
          ? parsed.continuationToken
          : undefined,
      sessionId:
        typeof parsed.sessionId === "string" ? parsed.sessionId : undefined,
      streamIndex: parsed.streamIndex,
    };
  } catch {
    return undefined;
  }
}

function readStoredEveEvents(storageKey: string): HandleMessageStreamEvent[] {
  if (typeof window === "undefined") {
    return [];
  }

  const stored = window.sessionStorage.getItem(storageKey);

  if (!stored) {
    return [];
  }

  try {
    const parsed = JSON.parse(stored);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isHandleMessageStreamEvent);
  } catch {
    return [];
  }
}

function storeEveSession(storageKey: string, session: SessionState) {
  if (typeof window === "undefined") {
    return;
  }

  if (!session.sessionId && !session.continuationToken) {
    window.sessionStorage.removeItem(storageKey);
    return;
  }

  window.sessionStorage.setItem(
    storageKey,
    JSON.stringify(session),
  );
}

function storeEveEvents(
  storageKey: string,
  events: readonly HandleMessageStreamEvent[],
) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(
    storageKey,
    JSON.stringify(events.slice(-eveStoredEventLimit)),
  );
}

function clearStoredEveSession(storageKey: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(storageKey);
}

function clearStoredEveEvents(storageKey: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(storageKey);
}

function clearLegacyLocalEveStorage(storageKey: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(storageKey);
}

function snapshotHasSuccessfulMutation(
  snapshot: EveAgentStoreSnapshot<EveMessageData>,
) {
  return snapshot.events.some((event) => {
    if (event.type !== "action.result" || event.data.status !== "completed") {
      return false;
    }

    const result = event.data.result;

    return (
      result.kind === "tool-result" &&
      mutationToolNames.has(result.toolName)
    );
  });
}

function isStaleEveSessionError(error: Error) {
  const message = error.message.toLowerCase();

  return (
    message.includes("socket hang up") ||
    message.includes("econnreset") ||
    message.includes("failed to proxy") ||
    (message.includes("enoent") &&
      message.includes(".eve/dev-runtime/snapshots"))
  );
}

function isHandleMessageStreamEvent(
  value: unknown,
): value is HandleMessageStreamEvent {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const event = value as { data?: unknown; type?: unknown };

  return typeof event.type === "string" && event.data !== undefined;
}

function byteCount(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function formatBytes(value: number | null) {
  if (value === null) {
    return "Unknown";
  }

  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
